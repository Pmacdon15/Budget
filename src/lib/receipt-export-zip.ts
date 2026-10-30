import { concat, ZipWriter } from "@/lib/exports/zip";
import type {
  ReceiptExportError,
  ReceiptExportManifest,
} from "@/lib/receipt-export";

/*
 * Builds the receipts .zip in the browser: the summaries (CSV, Excel, PDF)
 * at the top, then every receipt copy under `receipts/`. The server only
 * lists the files; each is fetched through its owner-checked route and
 * stored, so no function has to hold a whole archive in memory or run past
 * its time limit.
 */

export class NothingToExportError extends Error {
  constructor() {
    super("Nothing was spent in this period.");
    this.name = "NothingToExportError";
  }
}

export type ExportProgress = { done: number; total: number };

export type ExportZip = {
  blob: Blob;
  filename: string;
  /** Receipt copies in the zip. */
  receipts: number;
  /** Receipt copies that couldn't be fetched; listed in missing-receipts.txt. */
  skipped: number;
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Lists receipts that couldn't be fetched, so the zip says what's missing. */
export const MISSING_LIST = "missing-receipts.txt";

/** The JSON `{ error }` the routes send, or a generic message. */
async function errorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as Partial<ReceiptExportError>;
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // not JSON; use the fallback
  }
  return fallback;
}

const tooBig = () =>
  new Error("These receipts are too big for one zip. Pick a shorter period.");

export async function buildExportZip(
  manifestHref: string,
  {
    fetch: fetcher = (input, init) => fetch(input, init),
    onProgress,
    signal,
  }: {
    fetch?: Fetch;
    onProgress?: (progress: ExportProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ExportZip> {
  const response = await fetcher(manifestHref, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await errorMessage(response, "Couldn't list the receipts."),
    );
  }
  const manifest = (await response.json()) as ReceiptExportManifest;
  if (manifest.expenditureCount === 0) throw new NothingToExportError();

  const total = manifest.summaries.length + manifest.receipts.length;
  const writer = new ZipWriter();
  const parts: Uint8Array[] = [];
  const missing: string[] = [];
  let done = 0;
  onProgress?.({ done, total });

  const add = (name: string, data: Uint8Array) => {
    if (!writer.fits(data.length)) throw tooBig();
    parts.push(...writer.add({ name, data }));
  };

  // A summary is the point of the download: if one fails, the whole zip does.
  for (const summary of manifest.summaries) {
    const res = await fetcher(summary.url, { signal });
    if (!res.ok) {
      throw new Error(
        await errorMessage(res, "Couldn't build the summary. Try again."),
      );
    }
    add(summary.filename, new Uint8Array(await res.arrayBuffer()));
    onProgress?.({ done: ++done, total });
  }

  // A receipt that can't be fetched (deleted meanwhile, network hiccup) is
  // left out and named in missing-receipts.txt.
  for (const receipt of manifest.receipts) {
    let bytes: Uint8Array | null = null;
    try {
      const res = await fetcher(receipt.url, { signal });
      if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    if (bytes && bytes.length > 0) add(receipt.filename, bytes);
    else missing.push(receipt.filename);
    onProgress?.({ done: ++done, total });
  }

  if (writer.entryCount === 0) {
    throw new Error("Couldn't download any of the receipts. Try again.");
  }
  if (missing.length > 0) {
    add(
      MISSING_LIST,
      new TextEncoder().encode(
        `These receipts couldn't be downloaded. Try the download again, or open them in Budget.\n\n${missing.join("\n")}\n`,
      ),
    );
  }
  parts.push(writer.finish());

  return {
    blob: new Blob([concat(parts) as BlobPart], { type: "application/zip" }),
    filename: manifest.filename,
    receipts: manifest.receipts.length - missing.length,
    skipped: missing.length,
  };
}
