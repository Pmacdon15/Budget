import { describe, expect, it } from "vitest";
import {
  decodeBase64File,
  looksLikePdf,
  servableBytes,
} from "@/lib/receipt-bytes";

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

describe("decodeBase64File", () => {
  it.each([
    ["plain base64", b64(PDF)],
    [
      "base64url (Gmail API attachments)",
      Buffer.from(PDF).toString("base64url"),
    ],
    ["a data URL", `data:application/pdf;base64,${b64(PDF)}`],
    [
      "a data URL with a name",
      `data:application/pdf;name=a.pdf;base64,${b64(PDF)}`,
    ],
    ["MIME line breaks", b64(PDF).replace(/(.{8})/g, "$1\r\n")],
    ["surrounding whitespace", `  ${b64(PDF)}\n`],
    ["base64 of the base64", Buffer.from(b64(PDF)).toString("base64")],
  ])("decodes a PDF sent as %s", (_shape, value) => {
    expect(decodeBase64File(value, "pdf")).toEqual(PDF);
  });

  it("decodes a JPEG the same ways", () => {
    expect(decodeBase64File(b64(JPEG), "jpeg")).toEqual(JPEG);
    expect(
      decodeBase64File(`data:image/jpeg;base64,${b64(JPEG)}`, "jpeg"),
    ).toEqual(JPEG);
    expect(
      decodeBase64File(Buffer.from(b64(JPEG)).toString("base64"), "jpeg"),
    ).toEqual(JPEG);
  });

  it("keeps a PDF whose header follows a byte order mark", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...PDF]);
    expect(decodeBase64File(b64(withBom), "pdf")).toEqual(withBom);
  });

  it("is null for something that isn't the file it claims to be", () => {
    expect(
      decodeBase64File(b64(new TextEncoder().encode("<html>")), "pdf"),
    ).toBeNull();
    expect(decodeBase64File(b64(PDF), "jpeg")).toBeNull();
    expect(decodeBase64File(b64(JPEG), "pdf")).toBeNull();
    expect(decodeBase64File("", "pdf")).toBeNull();
    expect(decodeBase64File("not base64 at all!", "pdf")).toBeNull();
  });
});

describe("looksLikePdf", () => {
  it("finds %PDF- at the start or within the first 1024 bytes", () => {
    expect(looksLikePdf(PDF)).toBe(true);
    expect(looksLikePdf(new Uint8Array([10, 10, ...PDF]))).toBe(true);
    expect(
      looksLikePdf(new Uint8Array([...new Uint8Array(1100), ...PDF])),
    ).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe("servableBytes", () => {
  it("serves a stored PDF as it is", () => {
    expect(servableBytes(PDF, "pdf")).toBe(PDF);
  });

  it("decodes a PDF that was stored still base64-encoded", () => {
    expect(servableBytes(new TextEncoder().encode(b64(PDF)), "pdf")).toEqual(
      PDF,
    );
  });

  it("is null for an empty file or one that isn't a PDF", () => {
    expect(servableBytes(new Uint8Array(), "pdf")).toBeNull();
    expect(servableBytes(new TextEncoder().encode("<html>"), "pdf")).toBeNull();
  });

  it("never re-decodes a real PDF that happens to be plain text", () => {
    // An uncompressed PDF is all ASCII, but it starts with %PDF-.
    const ascii = new TextEncoder().encode("%PDF-1.4\nBT /F1 12 Tf ET\n%%EOF");
    expect(servableBytes(ascii, "pdf")).toBe(ascii);
  });
});
