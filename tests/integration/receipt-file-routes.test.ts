import { get } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getEmail } from "@/app/api/receipts/[id]/email/route";
import { GET as getFile } from "@/app/api/receipts/[id]/file/route";
import { GET as getPendingEmail } from "@/app/api/receipts/pending/[id]/email/route";
import { GET as getPendingFile } from "@/app/api/receipts/pending/[id]/file/route";
import { insertPendingExpense } from "@/db/pending-expenses";
import type { ReceiptDetails } from "@/lib/pending-expenses";
import { signInAs, signOut } from "../helpers/auth";
import { rows } from "../helpers/test-db";

/*
 * The routes that serve a receipt's saved copy (photo, PDF or email). Only the
 * owner can read one, by id; a saved email comes back sandboxed.
 */

vi.mock("@vercel/blob", () => ({ get: vi.fn() }));

const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
const HTML = new TextEncoder().encode("<!doctype html><p>Your bill</p>");
const PDF_PATH = "receipts/user_a/6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b.pdf";
const EMAIL_PATH = "receipts/user_a/6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4c.html";
const PHOTO_PATH = "receipts/user_a/6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4d.jpg";

function blobReturns(bytes: Uint8Array, contentType = "text/plain") {
  vi.mocked(get).mockResolvedValueOnce({
    statusCode: 200,
    stream: new Blob([new Uint8Array(bytes)]).stream(),
    blob: { contentType, size: bytes.length },
  } as unknown as Awaited<ReturnType<typeof get>>);
}

/** A receipts row of user_a's with the given columns, returning its id. */
async function receipt(columns: Record<string, string | null>) {
  const names = ["user_id", ...Object.keys(columns)];
  const values = ["user_a", ...Object.values(columns)].map((v) =>
    v === null ? "null" : `'${v.replace(/'/g, "''")}'`,
  );
  const [row] = await rows(
    `insert into receipts (${names.join(", ")}) values (${values.join(", ")}) returning id`,
  );
  return String(row?.id);
}

const fetchFile = (id: string, query = "") =>
  getFile(new Request(`https://budget.test/api/receipts/${id}/file${query}`), {
    params: Promise.resolve({ id }),
  });

const fetchEmail = (id: string, query = "") =>
  getEmail(
    new Request(`https://budget.test/api/receipts/${id}/email${query}`),
    {
      params: Promise.resolve({ id }),
    },
  );

const fetchPendingEmail = (id: string, query = "") =>
  getPendingEmail(
    new Request(`https://budget.test/api/receipts/pending/${id}/email${query}`),
    { params: Promise.resolve({ id }) },
  );

const fetchPending = (id: string, query = "") =>
  getPendingFile(
    new Request(`https://budget.test/api/receipts/pending/${id}/file${query}`),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.mocked(get).mockReset();
});

describe("GET /api/receipts/[id]/file", () => {
  it("shows the owner's PDF inline, and downloads it on request", async () => {
    const id = await receipt({
      file_pathname: PDF_PATH,
      file_kind: "pdf",
      file_name: "Rogers Oct.pdf",
    });
    blobReturns(PDF, "application/octet-stream");
    const response = await fetchFile(id);
    expect(response.status).toBe(200);
    // The type the app stored, never what the store says.
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(
      'inline; filename="Rogers Oct.pdf"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
    expect(get).toHaveBeenCalledWith(PDF_PATH, { access: "private" });

    blobReturns(PDF);
    const download = await fetchFile(id, "?download=1");
    expect(download.headers.get("Content-Disposition")).toContain(
      'attachment; filename="Rogers Oct.pdf"',
    );
  });

  it("serves a saved email sandboxed, named after its subject", async () => {
    const id = await receipt({
      file_pathname: EMAIL_PATH,
      file_kind: "email",
      email_subject: "Your bill is ready",
    });
    blobReturns(HTML);
    const response = await fetchEmail(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp).not.toContain("allow-scripts");
    expect(csp).toContain("default-src 'none'");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="Your bill is ready.html"',
    );
    expect(await response.text()).toContain("Your bill");
  });

  it("keeps emails on the sandboxed /email route and files off it", async () => {
    const email = await receipt({
      file_pathname: EMAIL_PATH,
      file_kind: "email",
    });
    const pdf = await receipt({ file_pathname: PDF_PATH, file_kind: "pdf" });

    const toEmail = await fetchFile(email, "?download=1");
    expect(toEmail.status).toBe(307);
    expect(toEmail.headers.get("Location")).toBe(
      `https://budget.test/api/receipts/${email}/email?download=1`,
    );
    const toFile = await fetchEmail(pdf);
    expect(toFile.status).toBe(307);
    expect(toFile.headers.get("Location")).toBe(
      `https://budget.test/api/receipts/${pdf}/file`,
    );
    expect(get).not.toHaveBeenCalled();

    // Someone else's gets the same 404 on either route.
    signInAs("user_b");
    expect((await fetchEmail(email)).status).toBe(404);
    expect((await fetchFile(email)).status).toBe(404);
  });

  it("serves a photo too", async () => {
    const id = await receipt({ image_pathname: PHOTO_PATH, merchant: "Shell" });
    blobReturns(new Uint8Array([0xff, 0xd8, 0xff]));
    const response = await fetchFile(id, "?download=1");
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toContain(
      'attachment; filename="Shell.jpg"',
    );
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("is a 404 for someone else's receipt, a bad id, details only, or a missing file", async () => {
    const id = await receipt({ file_pathname: PDF_PATH, file_kind: "pdf" });
    const detailsOnly = await receipt({ merchant: "Shell" });

    signInAs("user_b");
    expect((await fetchFile(id)).status).toBe(404);
    expect((await fetchFile(id, "?download=1")).status).toBe(404);
    expect((await fetchFile("not-a-uuid")).status).toBe(404);

    signInAs("user_a");
    expect((await fetchFile(detailsOnly)).status).toBe(404);
    expect(get).not.toHaveBeenCalled();

    vi.mocked(get).mockResolvedValueOnce(null);
    expect((await fetchFile(id)).status).toBe(404);
  });

  it("requires sign-in", async () => {
    const id = await receipt({ file_pathname: PDF_PATH, file_kind: "pdf" });
    signOut();
    expect((await fetchFile(id)).status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("is a 502 when the store is down", async () => {
    const id = await receipt({ file_pathname: PDF_PATH, file_kind: "pdf" });
    vi.mocked(get).mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await fetchFile(id)).status).toBe(502);
  });
});

describe("GET /api/receipts/pending/[id]/file", () => {
  const withEmail: ReceiptDetails = {
    merchant: "Rogers",
    purchasedOn: null,
    subtotalCents: null,
    taxCents: null,
    totalCents: 8_500,
    rawText: null,
    imagePathname: null,
    filePathname: EMAIL_PATH,
    fileKind: "email",
    emailSubject: "Your bill",
  };

  const item = (userId: string, receipt: ReceiptDetails | null) =>
    insertPendingExpense(userId, {
      spentOn: "2026-10-20",
      description: "Rogers",
      merchant: "Rogers",
      category: "Utilities",
      amountCents: 8_500,
      source: null,
      client: "Claude",
      receipt,
    });

  it("serves the copy an AI attached, only to its owner", async () => {
    const id = await item("user_a", withEmail);
    const redirect = await fetchPending(id);
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("Location")).toBe(
      `https://budget.test/api/receipts/pending/${id}/email`,
    );

    blobReturns(HTML);
    const response = await fetchPendingEmail(id, "?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
      'attachment; filename="Your bill.html"',
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox",
    );
    expect(get).toHaveBeenCalledWith(EMAIL_PATH, { access: "private" });

    signInAs("user_b");
    expect((await fetchPendingEmail(id)).status).toBe(404);
    expect((await fetchPending(id)).status).toBe(404);
    signOut();
    expect((await fetchPendingEmail(id)).status).toBe(401);
  });

  it("is a 404 for an item with no copy", async () => {
    const none = await item("user_a", null);
    const details = await item("user_a", {
      ...withEmail,
      filePathname: null,
      fileKind: null,
    });
    expect((await fetchPending(none)).status).toBe(404);
    expect((await fetchPending(details)).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });
});
