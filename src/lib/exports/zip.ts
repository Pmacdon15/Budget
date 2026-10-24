// A small ZIP writer: enough for the .xlsx downloads, which are ZIPs of XML.
// Ported from Receipt Scanner Pro.
//
// Kept in-house rather than pulling in a library because the format needed is
// tiny: stored or deflated entries, UTF-8 names, no encryption. It does not
// write ZIP64, so an archive has to stay under 4 GiB and 65,535 entries;
// callers check `fits()` before adding and stop early when it says no.
//
// No Node or browser APIs beyond TextEncoder, so it runs in both. Compression
// is passed in (node:zlib on the server); without it every entry is stored.

/** Raw DEFLATE (no zlib header), e.g. node:zlib's deflateRawSync. */
export type Deflate = (data: Uint8Array) => Uint8Array;

export type ZipEntry = {
  /** Path inside the archive, "/"-separated. */
  name: string;
  data: Uint8Array;
  /** Shown as the file's modified time when unzipped. Defaults to now. */
  modified?: Date;
  /** Deflate the entry when the writer has a Deflate; worth it for XML. */
  compress?: boolean;
};

const MAX_ENTRIES = 0xffff;
// Leave room for the central directory and end record under the 4 GiB line.
const MAX_BYTES = 0xffffffff - 64 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  // DOS dates start in 1980; clamp anything earlier rather than wrapping.
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
  };
}

const encoder = new TextEncoder();

type CentralRecord = {
  name: Uint8Array;
  crc: number;
  method: number;
  compressedSize: number;
  size: number;
  time: number;
  date: number;
  offset: number;
};

export class ZipWriter {
  private records: CentralRecord[] = [];
  private offset = 0;

  constructor(private readonly deflate?: Deflate) {}

  /** Whether one more entry of about `bytes` still fits without ZIP64. */
  fits(bytes: number): boolean {
    return (
      this.records.length < MAX_ENTRIES &&
      this.offset + bytes + 1024 < MAX_BYTES
    );
  }

  get entryCount() {
    return this.records.length;
  }

  /** The bytes for one entry (local header + data), in order. */
  add(entry: ZipEntry): Uint8Array[] {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    let method = 0;
    let body = entry.data;
    if (entry.compress && this.deflate && entry.data.length > 0) {
      const deflated = this.deflate(entry.data);
      if (deflated.length < entry.data.length) {
        method = 8;
        body = deflated;
      }
    }

    const { time, date } = dosDateTime(entry.modified ?? new Date());

    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header signature
    view.setUint16(4, 20, true); // version needed: 2.0
    view.setUint16(6, 0x0800, true); // flags: names are UTF-8
    view.setUint16(8, method, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, body.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true); // no extra field
    header.set(name, 30);

    this.records.push({
      name,
      crc,
      method,
      compressedSize: body.length,
      size: entry.data.length,
      time,
      date,
      offset: this.offset,
    });
    this.offset += header.length + body.length;

    return [header, body];
  }

  /** The central directory and end record. Call once, after the last add. */
  finish(): Uint8Array {
    const size = this.records.reduce((sum, r) => sum + 46 + r.name.length, 0);
    const out = new Uint8Array(size + 22);
    const view = new DataView(out.buffer);
    let p = 0;

    for (const r of this.records) {
      view.setUint32(p, 0x02014b50, true); // central directory signature
      view.setUint16(p + 4, 20, true); // version made by
      view.setUint16(p + 6, 20, true); // version needed
      view.setUint16(p + 8, 0x0800, true);
      view.setUint16(p + 10, r.method, true);
      view.setUint16(p + 12, r.time, true);
      view.setUint16(p + 14, r.date, true);
      view.setUint32(p + 16, r.crc, true);
      view.setUint32(p + 20, r.compressedSize, true);
      view.setUint32(p + 24, r.size, true);
      view.setUint16(p + 28, r.name.length, true);
      // extra, comment, disk, internal and external attributes are all zero
      view.setUint32(p + 42, r.offset, true);
      out.set(r.name, p + 46);
      p += 46 + r.name.length;
    }

    view.setUint32(p, 0x06054b50, true); // end of central directory
    view.setUint16(p + 8, this.records.length, true);
    view.setUint16(p + 10, this.records.length, true);
    view.setUint32(p + 12, size, true);
    view.setUint32(p + 16, this.offset, true);

    return out;
  }
}

/** A whole archive in memory, as one array of bytes. */
export function zipSync(
  entries: readonly ZipEntry[],
  { deflate }: { deflate?: Deflate } = {},
): Uint8Array {
  const writer = new ZipWriter(deflate);
  const parts: Uint8Array[] = [];
  for (const entry of entries) parts.push(...writer.add(entry));
  parts.push(writer.finish());
  return concat(parts);
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
