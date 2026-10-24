"use client";

import { Camera, ImageUp, Loader2, ScanLine } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/compress-image";
import type { ScanResponse } from "@/lib/types";

/** A finished scan: what the server returned plus a local preview of the photo. */
export type ScannedReceipt = ScanResponse & { previewUrl: string };

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
    ...(json.unavailable ? { unavailable: true } : {}),
  };
}

/**
 * Two hidden file inputs: one that opens the camera (`capture`) and one that
 * opens the photo library. Returns triggers for each and the scanning state;
 * `onScanned` gets the finished scan with a local preview of the photo.
 */
export function useReceiptPicker(onScanned: (scan: ScannedReceipt) => void) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same photo again still fires a change.
    event.target.value = "";
    if (!file) return;

    setScanning(true);
    try {
      const photo = await compressImage(file);
      const result = await scanReceipt(photo);
      onScanned({ ...result, previewUrl: URL.createObjectURL(photo) });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't scan that receipt.",
      );
    } finally {
      setScanning(false);
    }
  };

  const inputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Take a photo of the receipt"
        onChange={onFile}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a photo of the receipt"
        onChange={onFile}
      />
    </>
  );

  return {
    scanning,
    inputs,
    takePhoto: () => camera.current?.click(),
    choosePhoto: () => library.current?.click(),
  };
}

/** "Take photo" / "Choose photo", for inside the add-expense form. */
export function ReceiptPicker({
  onScanned,
}: {
  onScanned: (scan: ScannedReceipt) => void;
}) {
  const { scanning, inputs, takePhoto, choosePhoto } =
    useReceiptPicker(onScanned);

  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <span className="flex items-center gap-1.5 font-medium text-sm">
        <ScanLine className="size-4" /> Have a receipt? Scan it to fill this in
      </span>
      {scanning ? (
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" /> Reading receipt…
        </span>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={takePhoto}>
            <Camera /> Take photo
          </Button>
          <Button type="button" variant="outline" onClick={choosePhoto}>
            <ImageUp /> Choose photo
          </Button>
        </div>
      )}
      {inputs}
    </div>
  );
}
