import { concat, ZipWriter } from "@/lib/exports/zip";
import type {
  ReceiptPhotoError,
  ReceiptPhotoManifest,
} from "@/lib/receipt-photos";

/*
 * Builds the receipt-photo zip in the browser. The server only lists the
 * photos; each one is fetched through the owner-checked image route and
 * stored (JPEGs don't shrink when deflated), so no function has to hold a
 * whole archive in memory or run past its time limit.
 */

export class NoPhotosError extends Error {
  constructor() {
    super("There are no receipt photos for these months and categories.");
    this.name = "NoPhotosError";
  }
}

export type ZipProgress = { done: number; total: number };

export type ReceiptZip = {
  blob: Blob;
  filename: string;
  /** Photos in the zip. */
  count: number;
  /** Photos that couldn't be fetched (deleted meanwhile, network hiccup). */
  skipped: number;
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The JSON `{ error }` the routes send, or a generic message. */
async function errorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as Partial<ReceiptPhotoError>;
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // not JSON; use the fallback
  }
  return fallback;
}

export async function buildReceiptZip(
  manifestHref: string,
  {
    fetch: fetcher = (input, init) => fetch(input, init),
    onProgress,
    signal,
  }: {
    fetch?: Fetch;
    onProgress?: (progress: ZipProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ReceiptZip> {
  const response = await fetcher(manifestHref, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await errorMessage(response, "Couldn't list the receipt photos."),
    );
  }
  const manifest = (await response.json()) as ReceiptPhotoManifest;
  const total = manifest.photos.length;
  if (total === 0) throw new NoPhotosError();

  const writer = new ZipWriter();
  const parts: Uint8Array[] = [];
  let skipped = 0;
  onProgress?.({ done: 0, total });

  for (const [i, photo] of manifest.photos.entries()) {
    let bytes: Uint8Array | null = null;
    try {
      const res = await fetcher(photo.url, { signal });
      if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    if (bytes) {
      if (!writer.fits(bytes.length)) {
        throw new Error(
          "These photos are too big for one zip. Pick fewer months or categories.",
        );
      }
      parts.push(...writer.add({ name: photo.filename, data: bytes }));
    } else {
      skipped++;
    }
    onProgress?.({ done: i + 1, total });
  }

  if (writer.entryCount === 0) {
    throw new Error("Couldn't download any of the receipt photos. Try again.");
  }
  parts.push(writer.finish());

  return {
    blob: new Blob([concat(parts) as BlobPart], { type: "application/zip" }),
    filename: manifest.filename,
    count: writer.entryCount,
    skipped,
  };
}

/** Hands a blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
