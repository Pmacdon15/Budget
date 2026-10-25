"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  buildReceiptZip,
  type ReceiptZip,
  saveBlob,
  type ZipProgress,
} from "@/lib/receipt-photos-zip";

/** Builds the receipt-photo zip in the browser and saves it, with progress. */
export function useDownloadReceiptPhotos() {
  const [progress, setProgress] = useState<ZipProgress | null>(null);
  const mutation = useMutation<ReceiptZip, Error, string>({
    mutationKey: ["receipt-photos", "zip"],
    mutationFn: async (href) => {
      const zip = await buildReceiptZip(href, { onProgress: setProgress });
      saveBlob(zip.blob, zip.filename);
      return zip;
    },
    onSettled: () => setProgress(null),
  });
  return { ...mutation, progress };
}
