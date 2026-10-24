"use client";

import { Camera, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ExpenseDialog,
  type ScannedReceipt,
} from "@/components/forms/expense-dialog";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/compress-image";
import type { ScanResponse } from "@/lib/types";

/** Posts the photo to the scan route and returns its reading. */
export async function scanReceipt(photo: Blob): Promise<ScanResponse> {
  const body = new FormData();
  body.append("file", photo, "receipt.jpg");
  const response = await fetch("/api/receipts", { method: "POST", body });
  const json = (await response.json().catch(() => null)) as
    | (Partial<ScanResponse> & { error?: string })
    | null;
  if (!response.ok || !json || typeof json.image !== "string") {
    throw new Error(json?.error ?? "Couldn't scan that receipt. Try again.");
  }
  return {
    image: json.image,
    recognised: Boolean(json.recognised),
    fields: json.fields ?? {},
  };
}

/**
 * "Scan receipt": pick or take a photo, let the AI read it, then confirm the
 * pre-filled expense. The photo and what was read are saved with the expense.
 */
export function ScanReceiptButton({ month }: { month: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScannedReceipt | null>(null);
  const [open, setOpen] = useState(false);

  // Free the last preview when it is replaced or the page goes away.
  useEffect(() => {
    if (!scan) return;
    return () => URL.revokeObjectURL(scan.previewUrl);
  }, [scan]);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same photo again still fires a change.
    event.target.value = "";
    if (!file) return;

    setScanning(true);
    try {
      const photo = await compressImage(file);
      const result = await scanReceipt(photo);
      setScan({ ...result, previewUrl: URL.createObjectURL(photo) });
      setOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't scan that receipt.",
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        disabled={scanning}
        onClick={() => input.current?.click()}
      >
        {scanning ? <Loader2 className="animate-spin" /> : <Camera />}
        {scanning ? "Reading receipt…" : "Scan receipt"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Receipt photo"
        onChange={onFile}
      />
      {scan ? (
        <ExpenseDialog
          key={scan.image}
          month={month}
          scan={scan}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}
