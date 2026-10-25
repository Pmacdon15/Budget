import { crc32 } from "@/lib/exports/zip";

/** One file read back out of a ZIP. */
export type UnzippedEntry = {
  name: string;
  method: number;
  crc: number;
  data: Uint8Array;
};

/**
 * Reads a ZIP of stored entries the way an unzip tool would: walks the
 * central directory, then each local header it points at, and checks every
 * entry's CRC against its bytes. Throws on anything malformed.
 */
export function readZip(zip: Uint8Array): UnzippedEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  if (view.getUint32(end, true) !== 0x06054b50) {
    throw new Error("no end-of-central-directory record");
  }
  const count = view.getUint16(end + 10, true);
  const dirSize = view.getUint32(end + 12, true);
  const dirOffset = view.getUint32(end + 16, true);
  if (dirOffset + dirSize !== end) throw new Error("central directory size");

  const decoder = new TextDecoder();
  const entries: UnzippedEntry[] = [];
  let p = dirOffset;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) {
      throw new Error(`bad central record ${i}`);
    }
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(zip.slice(p + 46, p + 46 + nameLength));

    if (view.getUint32(offset, true) !== 0x04034b50) {
      throw new Error(`bad local header for ${name}`);
    }
    const localName = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + extra;
    const data = zip.slice(start, start + size);
    if (method === 0 && crc32(data) !== crc) {
      throw new Error(`CRC mismatch for ${name}`);
    }
    entries.push({ name, method, crc, data });
    p += 46 + nameLength;
  }
  return entries;
}
