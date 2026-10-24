/**
 * Shrinks a receipt photo in the browser before upload. Phone cameras produce
 * 4–12MB images; only the downscaled JPEG leaves the device.
 */

import { IMAGE_CONTENT_TYPE, MAX_IMAGE_BYTES } from "@/lib/receipt-image";

/** Receipts are tall and thin; this keeps small print legible. */
const MAX_EDGE = 1600;
/** Below this, text is lost faster than bytes are saved. */
const MIN_EDGE = 640;
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.46];

export class ImageCompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCompressionError";
  }
}

export async function compressImage(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new ImageCompressionError("That file isn't an image.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageCompressionError(
      "That photo couldn't be opened. Try a JPEG or PNG.",
    );
  }

  try {
    let edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));
    while (edge >= MIN_EDGE) {
      const canvas = drawScaled(bitmap, edge);
      for (const quality of QUALITY_STEPS) {
        const blob = await encodeJpeg(canvas, quality);
        if (blob.size <= maxBytes) return blob;
      }
      edge = Math.round(edge / 2);
    }
    throw new ImageCompressionError(
      "That photo is too large even after shrinking. Try a tighter crop.",
    );
  } finally {
    bitmap.close();
  }
}

function drawScaled(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImageCompressionError("This browser can't process photos.");
  }
  context.imageSmoothingQuality = "high";
  // JPEG has no transparency; without a fill, transparent pixels turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new ImageCompressionError("Couldn't encode the photo.")),
      IMAGE_CONTENT_TYPE,
      quality,
    );
  });
}
