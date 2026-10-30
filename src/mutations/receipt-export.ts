"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  buildExportZip,
  type ExportProgress,
  type ExportZip,
} from "@/lib/receipt-export-zip";
import { saveBlob } from "@/lib/receipt-photos-zip";

/** Builds the receipts .zip for a period in the browser and saves it. */
export function useDownloadReceiptExport() {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const mutation = useMutation<ExportZip, Error, string>({
    mutationKey: ["receipt-export", "zip"],
    mutationFn: async (href) => {
      const zip = await buildExportZip(href, { onProgress: setProgress });
      saveBlob(zip.blob, zip.filename);
      return zip;
    },
    onSettled: () => setProgress(null),
  });
  return { ...mutation, progress };
}
