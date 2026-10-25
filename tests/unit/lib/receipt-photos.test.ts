import { describe, expect, it, vi } from "vitest";
import { crc32, ZipWriter, zipSync } from "@/lib/exports/zip";
import {
  buildPhotoManifest,
  dedupeNames,
  MAX_ZIP_PHOTOS,
  photoFilename,
  type ReceiptPhotoRow,
  receiptPhotosHref,
  sanitizeName,
  tooManyPhotosMessage,
  zipFilename,
} from "@/lib/receipt-photos";
import { buildReceiptZip, NoPhotosError } from "@/lib/receipt-photos-zip";
import { readZip } from "../../helpers/zip";

const row = (over: Partial<ReceiptPhotoRow> = {}): ReceiptPhotoRow => ({
  id: "2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c",
  date: "2026-10-05",
  merchant: "Costco Wholesale",
  description: "Costco",
  ...over,
});

const bytes = (...values: number[]) => new Uint8Array(values);

describe("zip writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("round-trips stored entries byte for byte", () => {
    const photo = new Uint8Array(5_000).map((_, i) => (i * 31) % 256);
    const zip = zipSync([
      { name: "2026-10-05_costco_2b7e1c2a.jpg", data: photo },
      { name: "café.jpg", data: bytes(0xff, 0xd8, 0xff) },
      { name: "empty.jpg", data: new Uint8Array() },
    ]);

    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual([
      "2026-10-05_costco_2b7e1c2a.jpg",
      "café.jpg",
      "empty.jpg",
    ]);
    expect(entries.every((e) => e.method === 0)).toBe(true);
    expect(entries[0].data).toEqual(photo);
    expect(entries[0].crc).toBe(crc32(photo));
    expect(entries[1].data).toEqual(bytes(0xff, 0xd8, 0xff));
    expect(entries[2].data).toHaveLength(0);
  });

  it("says no once an entry would push it past the ZIP limits", () => {
    const writer = new ZipWriter();
    expect(writer.fits(10_000_000)).toBe(true);
    expect(writer.fits(0xffffffff)).toBe(false);

    for (let i = 0; i < 0xffff; i++)
      writer.add({ name: `${i}`, data: bytes(i % 256) });
    expect(writer.entryCount).toBe(0xffff);
    expect(writer.fits(1)).toBe(false);
  });
});

describe("photo file names", () => {
  it("folds accents and strips anything unsafe", () => {
    expect(sanitizeName("Café Olé & Co.")).toBe("Cafe-Ole-Co");
    expect(sanitizeName("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeName("C:\\Windows\\x")).toBe("C-Windows-x");
    expect(sanitizeName("🧾🧾")).toBe("receipt");
    expect(sanitizeName("a".repeat(80))).toHaveLength(40);
  });

  it("names a photo date_merchant_shortid.jpg", () => {
    expect(photoFilename(row())).toBe(
      "2026-10-05_Costco-Wholesale_2b7e1c2a.jpg",
    );
    expect(
      photoFilename(row({ merchant: null, description: "Gas / fuel" })),
    ).toBe("2026-10-05_Gas-fuel_2b7e1c2a.jpg");
    expect(photoFilename(row({ merchant: "  ", date: "" }))).toBe(
      "undated_Costco_2b7e1c2a.jpg",
    );
  });

  it("gives repeated names their own spelling, ignoring case", () => {
    expect(
      dedupeNames(["a.jpg", "A.jpg", "a.jpg", "b.jpg", "a-2.jpg"]),
    ).toEqual(["a.jpg", "A-2.jpg", "a-3.jpg", "b.jpg", "a-2-2.jpg"]);
  });

  it("names the zip after the month range", () => {
    expect(zipFilename({ from: "2026-10", to: "2026-10" })).toBe(
      "receipt-photos-2026-10.zip",
    );
    expect(zipFilename({ from: "2026-01", to: "2026-10" })).toBe(
      "receipt-photos-2026-01-to-2026-10.zip",
    );
  });
});

describe("buildPhotoManifest", () => {
  it("lists one uniquely named file per receipt, served by the image route", () => {
    const manifest = buildPhotoManifest(
      [row(), row({ id: "2b7e1c2a-0000-4000-8000-000000000000" })],
      { from: "2026-10", to: "2026-10" },
    );
    expect(manifest).toEqual({
      filename: "receipt-photos-2026-10.zip",
      photos: [
        {
          filename: "2026-10-05_Costco-Wholesale_2b7e1c2a.jpg",
          url: "/api/receipts/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c/image",
        },
        {
          filename: "2026-10-05_Costco-Wholesale_2b7e1c2a-2.jpg",
          url: "/api/receipts/2b7e1c2a-0000-4000-8000-000000000000/image",
        },
      ],
    });
    expect(JSON.stringify(manifest)).not.toContain("receipts/user_");
  });
});

describe("receiptPhotosHref", () => {
  it("builds the manifest URL from the dialog's choices", () => {
    expect(
      receiptPhotosHref({
        from: "2026-01",
        to: "2026-10",
        categories: ["Groceries", "Dining", "Groceries"],
      }),
    ).toEqual({
      href: "/api/receipts/photos?from=2026-01&to=2026-10&category=Groceries&category=Dining",
    });
  });

  it("explains choices that can't be used", () => {
    expect(
      receiptPhotosHref({ from: "2026-10", to: "2026-10", categories: [] }),
    ).toEqual({ error: "Pick at least one category" });
    expect(
      receiptPhotosHref({
        from: "2026-10",
        to: "2026-01",
        categories: ["Dining"],
      }),
    ).toEqual({ error: "The start month must come before the end month" });
  });

  it("mentions the limit in the too-many message", () => {
    expect(tooManyPhotosMessage()).toContain(String(MAX_ZIP_PHOTOS));
  });
});

describe("buildReceiptZip", () => {
  const manifest = {
    filename: "receipt-photos-2026-10.zip",
    photos: [
      { filename: "a.jpg", url: "/api/receipts/1/image" },
      { filename: "b.jpg", url: "/api/receipts/2/image" },
      { filename: "c.jpg", url: "/api/receipts/3/image" },
    ],
  };

  const fakeFetch = (photos: Record<string, Response | Error>) =>
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/receipts/photos"))
        return Response.json(manifest);
      const answer = photos[url];
      if (answer instanceof Error) throw answer;
      return answer ?? new Response("Not found", { status: 404 });
    });

  it("fetches each photo through the image route and zips them in order", async () => {
    const fetch = fakeFetch({
      "/api/receipts/1/image": new Response(bytes(1, 1)),
      "/api/receipts/2/image": new Response(bytes(2, 2, 2)),
      "/api/receipts/3/image": new Response(bytes(3)),
    });
    const onProgress = vi.fn();

    const zip = await buildReceiptZip("/api/receipts/photos?from=2026-10", {
      fetch,
      onProgress,
    });

    expect(zip).toMatchObject({
      filename: "receipt-photos-2026-10.zip",
      count: 3,
      skipped: 0,
    });
    expect(zip.blob.type).toBe("application/zip");
    const entries = readZip(new Uint8Array(await zip.blob.arrayBuffer()));
    expect(entries.map((e) => [e.name, [...e.data]])).toEqual([
      ["a.jpg", [1, 1]],
      ["b.jpg", [2, 2, 2]],
      ["c.jpg", [3]],
    ]);
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
      { done: 0, total: 3 },
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  });

  it("leaves out photos it couldn't fetch and counts them", async () => {
    const fetch = fakeFetch({
      "/api/receipts/1/image": new Response(bytes(1)),
      "/api/receipts/2/image": new TypeError("network down"),
    });
    const zip = await buildReceiptZip("/api/receipts/photos", { fetch });
    expect(zip).toMatchObject({ count: 1, skipped: 2 });
  });

  it("fails when none of the photos could be fetched", async () => {
    await expect(
      buildReceiptZip("/api/receipts/photos", { fetch: fakeFetch({}) }),
    ).rejects.toThrow("Couldn't download any of the receipt photos");
  });

  it("says there are no photos instead of building an empty zip", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ filename: "x.zip", photos: [] }),
    );
    await expect(
      buildReceiptZip("/api/receipts/photos", { fetch }),
    ).rejects.toBeInstanceOf(NoPhotosError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows the server's JSON error message", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: tooManyPhotosMessage() }, { status: 413 }),
    );
    await expect(
      buildReceiptZip("/api/receipts/photos", { fetch }),
    ).rejects.toThrow(tooManyPhotosMessage());
  });

  it("falls back to a generic message when the error isn't JSON", async () => {
    const fetch = vi.fn(async () => new Response("<html>", { status: 502 }));
    await expect(
      buildReceiptZip("/api/receipts/photos", { fetch }),
    ).rejects.toThrow("Couldn't list the receipt photos.");
  });
});
