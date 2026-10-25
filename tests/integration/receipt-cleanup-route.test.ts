import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/receipt-photos/route";
import { insertExpenseWithReceipt } from "@/db/expenses";
import { deleteExpenseKeepingUndo } from "@/db/undo";
import {
  MAX_CLEANUP_PAGES,
  UNATTACHED_PHOTO_MAX_AGE_MS,
} from "@/lib/receipt-cleanup";
import {
  deleteReceiptImages,
  listReceiptImages,
  type StoredReceiptImage,
} from "@/lib/receipt-store";
import { UNDO_WINDOW_MINUTES } from "@/lib/undo";
import { signOut } from "../helpers/auth";
import { rows } from "../helpers/test-db";

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
  listReceiptImages: vi.fn(),
  deleteReceiptImages: vi.fn(),
}));

const SECRET = "test-cron-secret-0123456789";

const photo = (userId = "user_a") =>
  `receipts/${userId}/${crypto.randomUUID()}.jpg`;

const OLD = new Date(Date.now() - UNATTACHED_PHOTO_MAX_AGE_MS - 60_000);
const FRESH = new Date(Date.now() - 60_000);

/** The Blob store holds exactly these photos, served in pages of `pageSize`. */
function storeHolds(images: StoredReceiptImage[], pageSize = 1000) {
  vi.mocked(listReceiptImages).mockImplementation(async (cursor) => {
    const start = Number(cursor ?? 0);
    const end = start + pageSize;
    return {
      images: images.slice(start, end),
      cursor: end < images.length ? String(end) : undefined,
    };
  });
}

const deleted = () => vi.mocked(deleteReceiptImages).mock.calls.flat(2);

async function saveWithPhoto(userId: string, imagePathname: string) {
  await insertExpenseWithReceipt(
    userId,
    {
      month: "2026-10",
      spentOn: "2026-10-05",
      description: "Costco",
      category: "Groceries",
      amountCents: 11_300,
    },
    {
      imagePathname,
      merchant: "Costco Wholesale",
      purchasedOn: "2026-10-05",
      subtotalCents: 10_000,
      taxCents: 1_300,
      totalCents: 11_300,
      rawText: null,
    },
  );
  const [row] = await rows(
    "select id from expenses where user_id = $1 order by created_at desc limit 1",
    [userId],
  );
  return String(row?.id);
}

function cron(authorization: string | null = `Bearer ${SECRET}`) {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  return GET(
    new Request("https://budget.test/api/cron/receipt-photos", { headers }),
  );
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.mocked(listReceiptImages).mockReset();
  vi.mocked(deleteReceiptImages).mockReset();
  // Cron calls come from Vercel, not a signed-in user.
  signOut();
});

describe("GET /api/cron/receipt-photos", () => {
  describe("authorization", () => {
    it.each([
      ["no Authorization header", null],
      ["a wrong secret", "Bearer wrong"],
      ["a bare secret", SECRET],
    ])("refuses %s and touches nothing", async (_label, header) => {
      storeHolds([{ pathname: photo(), uploadedAt: OLD }]);
      const response = await cron(header);
      expect(response.status).toBe(401);
      expect(listReceiptImages).not.toHaveBeenCalled();
      expect(deleteReceiptImages).not.toHaveBeenCalled();
    });

    it("refuses every call when CRON_SECRET isn't set", async () => {
      vi.stubEnv("CRON_SECRET", "");
      storeHolds([{ pathname: photo(), uploadedAt: OLD }]);
      expect((await cron("Bearer ")).status).toBe(401);
      expect((await cron("Bearer undefined")).status).toBe(401);
      expect(listReceiptImages).not.toHaveBeenCalled();
    });
  });

  it("removes day-old photos that no receipt uses, for every user", async () => {
    const abandonedA = photo("user_a");
    const abandonedB = photo("user_b");
    storeHolds([
      { pathname: abandonedA, uploadedAt: OLD },
      { pathname: abandonedB, uploadedAt: OLD },
    ]);

    const response = await cron();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      checked: 2,
      deleted: 2,
      complete: true,
    });
    expect(deleted().sort()).toEqual([abandonedA, abandonedB].sort());
  });

  it("keeps photos saved with an expense, whoever's they are", async () => {
    const savedA = photo("user_a");
    const savedB = photo("user_b");
    const abandoned = photo("user_a");
    await saveWithPhoto("user_a", savedA);
    await saveWithPhoto("user_b", savedB);
    storeHolds([
      { pathname: savedA, uploadedAt: OLD },
      { pathname: abandoned, uploadedAt: OLD },
      { pathname: savedB, uploadedAt: OLD },
    ]);

    const body = await (await cron()).json();
    expect(body).toMatchObject({ checked: 3, deleted: 1 });
    expect(deleted()).toEqual([abandoned]);
  });

  it("keeps a photo less than a day old, since its form may still be open", async () => {
    storeHolds([{ pathname: photo(), uploadedAt: FRESH }]);
    const body = await (await cron()).json();
    expect(body).toMatchObject({ checked: 1, deleted: 0 });
    expect(deleted()).toEqual([]);
  });

  it("keeps a photo a just-deleted expense can still get back with Undo", async () => {
    const pathname = photo();
    const expenseId = await saveWithPhoto("user_a", pathname);
    expect(await deleteExpenseKeepingUndo("user_a", expenseId)).toBeTruthy();
    expect(await rows("select id from receipts")).toEqual([]);
    storeHolds([{ pathname, uploadedAt: OLD }]);

    await cron();
    expect(deleted()).toEqual([]);
  });

  it("removes that photo once the undo window has passed", async () => {
    const pathname = photo();
    const expenseId = await saveWithPhoto("user_a", pathname);
    await deleteExpenseKeepingUndo("user_a", expenseId);
    await rows(
      `update undo_deletes set created_at = now() - make_interval(mins => ${UNDO_WINDOW_MINUTES + 1})`,
    );
    storeHolds([{ pathname, uploadedAt: OLD }]);

    await cron();
    expect(deleted()).toEqual([pathname]);
  });

  it("leaves anything the app didn't mint under receipts/ alone", async () => {
    storeHolds([
      { pathname: "receipts/user_a/notes.txt", uploadedAt: OLD },
      { pathname: "receipts/user_a/../x.jpg", uploadedAt: OLD },
    ]);
    const body = await (await cron()).json();
    expect(body).toMatchObject({ checked: 2, deleted: 0 });
    expect(deleted()).toEqual([]);
  });

  it("works through every page of the store", async () => {
    const kept = photo();
    await saveWithPhoto("user_a", kept);
    const abandoned = [photo(), photo(), photo(), photo()];
    storeHolds(
      [kept, ...abandoned].map((pathname) => ({ pathname, uploadedAt: OLD })),
      2,
    );

    const body = await (await cron()).json();
    expect(body).toEqual({ checked: 5, deleted: 4, complete: true });
    expect(listReceiptImages).toHaveBeenCalledTimes(3);
    expect(deleted().sort()).toEqual([...abandoned].sort());
  });

  it("stops after MAX_CLEANUP_PAGES pages and leaves the rest for the next run", async () => {
    const images = Array.from({ length: MAX_CLEANUP_PAGES + 2 }, () => ({
      pathname: photo(),
      uploadedAt: OLD,
    }));
    storeHolds(images, 1);

    const body = await (await cron()).json();
    expect(body).toEqual({
      checked: MAX_CLEANUP_PAGES,
      deleted: MAX_CLEANUP_PAGES,
      complete: false,
    });
    expect(listReceiptImages).toHaveBeenCalledTimes(MAX_CLEANUP_PAGES);
  });

  it("answers 500 when the store fails, without leaking details", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listReceiptImages).mockRejectedValue(new Error("blob down"));

    const response = await cron();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Cleanup failed" });
    expect(error).toHaveBeenCalled();
  });
});
