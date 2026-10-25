import { z } from "zod";
import { CATEGORY_NAMES, type Category } from "@/lib/categories";
import { isMonth } from "@/lib/month";

/*
 * Receipt photos as a .zip: the server lists which photos match (a manifest),
 * and the browser fetches each one through the owner-checked image route and
 * zips them itself. Shared by the browser and the server.
 */

/** Most photos one zip will carry; past this the manifest asks for a smaller range. */
export const MAX_ZIP_PHOTOS = 300;

const yearMonth = z.string().refine(isMonth, "Pick a month");

/** Query string of the manifest: `?from=…&to=…&category=…`, like the expense download. */
export const receiptPhotosSchema = z
  .object({
    from: yearMonth,
    to: yearMonth,
    categories: z
      .array(z.enum(CATEGORY_NAMES, { error: "Pick a category" }))
      .min(1, "Pick at least one category")
      .transform((list) => [...new Set(list)]),
  })
  .refine((v) => v.from <= v.to, {
    message: "The start month must come before the end month",
    path: ["to"],
  });

export type ReceiptPhotosInput = z.output<typeof receiptPhotosSchema>;

/** One receipt with a photo, as the database hands it over. */
export type ReceiptPhotoRow = {
  id: string;
  date: string;
  merchant: string | null;
  description: string;
};

/** One file in the zip. `url` is the owner-checked image route, never a blob pathname. */
export type ReceiptPhotoEntry = { filename: string; url: string };

export type ReceiptPhotoManifest = {
  filename: string;
  photos: ReceiptPhotoEntry[];
};

/** Every failure comes back as JSON in this shape, never as a file. */
export type ReceiptPhotoError = { error: string };

export function tooManyPhotosMessage() {
  return `That's more than ${MAX_ZIP_PHOTOS} receipt photos. Pick fewer months or categories.`;
}

/** The manifest URL for these choices, or the reason they can't be used. */
export function receiptPhotosHref(choices: {
  from: string;
  to: string;
  categories: Category[];
}): { href: string } | { error: string } {
  const parsed = receiptPhotosSchema.safeParse(choices);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your choices" };
  }
  const params = new URLSearchParams({
    from: parsed.data.from,
    to: parsed.data.to,
  });
  for (const category of parsed.data.categories) {
    params.append("category", category);
  }
  return { href: `/api/receipts/photos?${params}` };
}

/**
 * A safe file-name part: accents folded, anything but letters, digits and
 * dashes turned into a dash, trimmed to a sensible length. Merchant names are
 * AI output, so nothing like `../` or `\` survives.
 */
export function sanitizeName(value: string, maxLength = 40) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return cleaned || "receipt";
}

/** `YYYY-MM-DD_merchant_<short id>.jpg`. */
export function photoFilename(row: ReceiptPhotoRow) {
  const name = sanitizeName(row.merchant?.trim() || row.description);
  const shortId = row.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "photo";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : "undated";
  return `${date}_${name}_${shortId}.jpg`;
}

/** Gives every name in the list its own spelling: `a.jpg`, `a-2.jpg`, `a-3.jpg`. */
export function dedupeNames(names: readonly string[]) {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
      candidate = `${stem}-${n}${ext}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function zipFilename(filters: Pick<ReceiptPhotosInput, "from" | "to">) {
  const range =
    filters.from === filters.to
      ? filters.from
      : `${filters.from}-to-${filters.to}`;
  return `receipt-photos-${range}.zip`;
}

/** The manifest for some receipts: one entry per receipt, uniquely named. */
export function buildPhotoManifest(
  rows: readonly ReceiptPhotoRow[],
  filters: Pick<ReceiptPhotosInput, "from" | "to">,
): ReceiptPhotoManifest {
  const names = dedupeNames(rows.map(photoFilename));
  return {
    filename: zipFilename(filters),
    photos: rows.map((row, i) => ({
      filename: names[i],
      url: `/api/receipts/${encodeURIComponent(row.id)}/image`,
    })),
  };
}
