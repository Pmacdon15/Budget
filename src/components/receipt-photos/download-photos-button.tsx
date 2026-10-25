"use client";

import { FileArchive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Category } from "@/lib/categories";
import { receiptPhotosHref } from "@/lib/receipt-photos";
import { NoPhotosError } from "@/lib/receipt-photos-zip";
import { useDownloadReceiptPhotos } from "@/mutations/receipt-photos";

/**
 * "Receipt photos (.zip)" in the download dialog: every receipt photo for the
 * chosen months and categories, zipped in the browser.
 */
export function DownloadPhotosButton({
  from,
  to,
  categories,
}: {
  from: string;
  to: string;
  categories: Category[];
}) {
  const download = useDownloadReceiptPhotos();
  const result = receiptPhotosHref({ from, to, categories });
  const { progress } = download;

  const start = () => {
    if (!("href" in result)) return;
    download.mutate(result.href, {
      onSuccess: (zip) => {
        if (zip.skipped > 0) {
          toast.warning(
            `${zip.skipped} of ${zip.count + zip.skipped} photos couldn't be downloaded and were left out.`,
          );
        }
      },
      onError: (error) => {
        if (error instanceof NoPhotosError) toast.info(error.message);
        else toast.error(error.message);
      },
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={!("href" in result) || download.isPending}
      onClick={start}
    >
      {download.isPending ? (
        <>
          <Loader2 className="animate-spin" />
          {progress && progress.total > 0
            ? `Zipping ${progress.done} of ${progress.total}…`
            : "Finding photos…"}
        </>
      ) : (
        <>
          <FileArchive /> Receipt photos (.zip)
        </>
      )}
    </Button>
  );
}
