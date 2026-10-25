import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/receipts/photos/route";
import {
  insertExpense,
  insertExpenseLines,
  insertExpenseWithReceipt,
  type ReceiptValues,
} from "@/db/expenses";
import { MAX_ZIP_PHOTOS, tooManyPhotosMessage } from "@/lib/receipt-photos";
import { signInAs, signOut } from "../helpers/auth";
import { testPg } from "../helpers/test-db";

const manifest = (query: string) =>
  GET(new Request(`https://budget.test/api/receipts/photos?${query}`));

const receipt = (over: Partial<ReceiptValues> = {}): ReceiptValues => ({
  imagePathname: `receipts/user_a/${crypto.randomUUID()}.jpg`,
  merchant: "Costco Wholesale",
  purchasedOn: "2026-10-05",
  subtotalCents: 10_000,
  taxCents: 1_300,
  totalCents: 11_300,
  rawText: null,
  ...over,
});

const ALL = "category=Groceries&category=Dining&category=Health";

async function receiptIds(userId: string) {
  const { rows } = await testPg().query<{ id: string; merchant: string }>(
    "select id, merchant from receipts where user_id = $1",
    [userId],
  );
  return Object.fromEntries(rows.map((r) => [r.merchant, r.id]));
}

beforeEach(async () => {
  // A receipt split across two categories: one photo, two expense parts.
  await insertExpenseLines(
    "user_a",
    { month: "2026-10", spentOn: "2026-10-05", description: "Costco" },
    [
      { category: "Groceries", amountCents: 8_000 },
      { category: "Health", amountCents: 3_300 },
    ],
    receipt(),
  );
  await insertExpenseWithReceipt(
    "user_a",
    {
      month: "2026-09",
      spentOn: "2026-09-20",
      description: "Lunch",
      category: "Dining",
      amountCents: 2_000,
    },
    receipt({ merchant: "Café Olé / Bar", purchasedOn: null }),
  );
  await insertExpense("user_a", {
    month: "2026-10",
    spentOn: "2026-10-07",
    description: "No receipt",
    category: "Groceries",
    amountCents: 500,
  });
  await insertExpenseWithReceipt(
    "user_b",
    {
      month: "2026-10",
      spentOn: "2026-10-05",
      description: "Not mine",
      category: "Groceries",
      amountCents: 99,
    },
    receipt({
      merchant: "Someone else",
      imagePathname: "receipts/user_b/secret.jpg",
    }),
  );
});

describe("GET /api/receipts/photos", () => {
  it("answers 401 as JSON when signed out", async () => {
    signOut();
    const res = await manifest(`from=2026-10&to=2026-10&${ALL}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      error: expect.stringContaining("signed out"),
    });
  });

  it("lists only this user's receipt photos, one per receipt, oldest first", async () => {
    const ids = await receiptIds("user_a");
    const res = await manifest(`from=2026-09&to=2026-10&${ALL}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await res.json();
    expect(body).toEqual({
      filename: "receipt-photos-2026-09-to-2026-10.zip",
      photos: [
        {
          // No purchase date read off it, so the expense's date is used.
          filename: `2026-09-20_Cafe-Ole-Bar_${ids["Café Olé / Bar"].slice(0, 8)}.jpg`,
          url: `/api/receipts/${ids["Café Olé / Bar"]}/image`,
        },
        {
          filename: `2026-10-05_Costco-Wholesale_${ids["Costco Wholesale"].slice(0, 8)}.jpg`,
          url: `/api/receipts/${ids["Costco Wholesale"]}/image`,
        },
      ],
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain("receipts/user_");
    expect(text).not.toContain("Someone else");
  });

  it("keeps another user's receipts to themselves", async () => {
    signInAs("user_b");
    const body = await (
      await manifest(`from=2026-10&to=2026-10&${ALL}`)
    ).json();
    expect(body.photos).toHaveLength(1);
    expect(body.photos[0].filename).toContain("Someone-else");
  });

  it("filters by month range and category", async () => {
    const october = await (
      await manifest(`from=2026-10&to=2026-10&${ALL}`)
    ).json();
    expect(october.photos).toHaveLength(1);
    expect(october.photos[0].filename).toContain("Costco");

    // Only the split receipt's Health part matches, and that's enough.
    const health = await (
      await manifest("from=2026-09&to=2026-10&category=Health")
    ).json();
    expect(health.photos).toHaveLength(1);
    expect(health.photos[0].filename).toContain("Costco");

    const none = await (
      await manifest("from=2026-09&to=2026-10&category=Transportation")
    ).json();
    expect(none.photos).toEqual([]);
  });

  it("rejects bad choices with a JSON message", async () => {
    const res = await manifest("from=2026-10&to=2026-09&category=Dining");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "The start month must come before the end month",
    });
    const noCategory = await manifest("from=2026-10&to=2026-10");
    expect(noCategory.status).toBe(400);
    expect(await noCategory.json()).toEqual({
      error: "Pick at least one category",
    });
  });

  it("answers past the limit with a JSON error, never a file", async () => {
    await testPg().exec(`
      with saved as (
        insert into receipts (user_id, merchant, image_pathname)
        select 'user_a', 'Bulk ' || n, 'receipts/user_a/bulk-' || n || '.jpg'
        from generate_series(1, ${MAX_ZIP_PHOTOS}) as n
        returning id
      )
      insert into expenses (user_id, month, spent_on, description, category, amount_cents, receipt_id)
      select 'user_a', '2026-08', '2026-08-01', 'Bulk', 'Groceries', 100, id from saved
    `);

    const res = await manifest("from=2026-08&to=2026-10&category=Groceries");
    expect(res.status).toBe(413);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(await res.json()).toEqual({ error: tooManyPhotosMessage() });

    // Exactly at the limit is fine.
    const atLimit = await manifest(
      "from=2026-08&to=2026-08&category=Groceries",
    );
    expect(atLimit.status).toBe(200);
    expect((await atLimit.json()).photos).toHaveLength(MAX_ZIP_PHOTOS);
  });
});
