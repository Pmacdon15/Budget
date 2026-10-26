import { describe, expect, it } from "vitest";
import {
  EMAIL_CONTENT_SECURITY_POLICY,
  emailDocument,
  safeStyle,
  sanitizeEmailHtml,
} from "@/lib/email-html";
import {
  attachReceiptInputSchema,
  receiptInputSchema,
} from "@/lib/pending-expenses";
import { contentDisposition } from "@/lib/receipt-file-response";
import {
  downloadFilename,
  isPdf,
  isReceiptFilePathname,
  newReceiptFilePathname,
  normalizeMessageId,
  receiptKindOf,
} from "@/lib/receipt-files";
import { securityHeaderRules } from "@/lib/security-headers";

const ID = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

describe("sanitizeEmailHtml", () => {
  it("removes scripts, event handlers, forms, frames and style blocks", () => {
    const html = sanitizeEmailHtml(`
      <p onclick="steal()">Total <b>$45.67</b></p>
      <script>alert(1)</script>
      <style>body { background: url(https://t.example/open.gif) }</style>
      <iframe src="https://evil.example"></iframe>
      <form action="https://evil.example"><input name="card"></form>
      <svg><script>alert(2)</script></svg>
      <a href="javascript:alert(3)">click</a>
      <meta http-equiv="refresh" content="0;url=https://evil.example">
      <base href="https://evil.example/">
    `);
    expect(html).toContain("Total <b>$45.67</b>");
    for (const banned of [
      "script",
      "onclick",
      "alert",
      "<style",
      "iframe",
      "<form",
      "<input",
      "javascript:",
      "<meta",
      "<base",
      "evil.example",
      "t.example",
    ]) {
      expect(html, banned).not.toContain(banned);
    }
  });

  it("drops remote images (tracking pixels) and keeps inline ones", () => {
    const pixel = "data:image/png;base64,iVBORw0KGgo=";
    const html = sanitizeEmailHtml(
      `<img src="https://track.example/p.gif?u=1" width="1"><img src="//track.example/x"><img src="${pixel}" alt="logo"><img src="data:image/svg+xml;base64,PHN2Zz4=">`,
    );
    expect(html).not.toContain("track.example");
    expect(html).not.toContain("svg");
    expect(html).toContain(`src="${pixel}"`);
    expect(html.match(/<img/g)).toHaveLength(1);
  });

  it("strips CSS that loads or runs anything, keeps the rest", () => {
    const html = sanitizeEmailHtml(
      `<td style="color: red; background-image: url('https://t.example/a.png'); width: expression(alert(1)); padding: 4px">x</td>`,
    );
    expect(html).toMatch(/color: ?red/);
    expect(html).toMatch(/padding: ?4px/);
    expect(html).not.toContain("url(");
    expect(html).not.toContain("expression");
    expect(safeStyle("behavior: url(x.htc); margin: 0")).toBe("margin: 0");
  });

  it("opens links in a new tab without a referrer", () => {
    const html = sanitizeEmailHtml(
      `<a href="https://rogers.com/bill" target="_self">View bill</a>`,
    );
    expect(html).toContain('href="https://rogers.com/bill"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe("emailDocument", () => {
  it("escapes the header and wraps the sanitized body", () => {
    const doc = emailDocument({
      subject: "Your bill <script>x</script>",
      from: "Rogers <billing@rogers.com>",
      date: "2026-10-20",
      html: "<p>Amount due $85.00</p><script>alert(1)</script>",
      text: null,
    });
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("Your bill &lt;script&gt;x&lt;/script&gt;");
    expect(doc).toContain("Rogers &lt;billing@rogers.com&gt;");
    expect(doc).toContain("<p>Amount due $85.00</p>");
    expect(doc).not.toContain("alert(1)");
    expect(doc).toContain('<meta name="referrer" content="no-referrer">');
  });

  it("keeps a plain-text email as escaped text", () => {
    const doc = emailDocument({
      subject: null,
      from: null,
      date: null,
      html: null,
      text: "Paid $12.00 <img src=x onerror=alert(1)>",
    });
    expect(doc).toContain("<title>Receipt email</title>");
    expect(doc).toContain(
      "<pre>Paid $12.00 &lt;img src=x onerror=alert(1)&gt;</pre>",
    );
  });

  it("gets the sandbox from next.config on its own routes, after the catch-all", () => {
    const rules = securityHeaderRules();
    expect(rules[0]?.source).toBe("/:path*");
    for (const source of [
      "/api/receipts/:id/email",
      "/api/receipts/pending/:id/email",
    ]) {
      const index = rules.findIndex((rule) => rule.source === source);
      expect(index, source).toBeGreaterThan(0);
      expect(rules[index]?.headers).toContainEqual({
        key: "Content-Security-Policy",
        value: EMAIL_CONTENT_SECURITY_POLICY,
      });
    }
  });

  it("is served sandboxed with no scripts and no network", () => {
    expect(EMAIL_CONTENT_SECURITY_POLICY).toContain("sandbox");
    expect(EMAIL_CONTENT_SECURITY_POLICY).not.toContain("allow-scripts");
    expect(EMAIL_CONTENT_SECURITY_POLICY).not.toContain("allow-same-origin");
    expect(EMAIL_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(EMAIL_CONTENT_SECURITY_POLICY).toContain("img-src data:");
  });
});

describe("receipt file pathnames", () => {
  it("mints PDF and email pathnames in the user's folder", () => {
    const pdf = newReceiptFilePathname("user_a", "pdf");
    const email = newReceiptFilePathname("user_a", "email");
    expect(pdf).toMatch(/^receipts\/user_a\/[0-9a-f-]{36}\.pdf$/);
    expect(email).toMatch(/^receipts\/user_a\/[0-9a-f-]{36}\.html$/);
    expect(isReceiptFilePathname(pdf)).toBe(true);
    expect(isReceiptFilePathname(email)).toBe(true);
  });

  it("rejects anything it didn't mint", () => {
    expect(() => newReceiptFilePathname("../x", "pdf")).toThrow();
    for (const value of [
      `receipts/user_a/${ID}.jpg`,
      `receipts/user_a/${ID}.exe`,
      `receipts/../${ID}.pdf`,
      `receipts/user_a/x/${ID}.pdf`,
      `other/user_a/${ID}.pdf`,
      42,
    ]) {
      expect(isReceiptFilePathname(value), String(value)).toBe(false);
    }
  });

  it("tells a PDF by its bytes", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
    expect(isPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(false);
  });
});

describe("receipt helpers", () => {
  it("normalizes Message-IDs", () => {
    expect(normalizeMessageId("  <ABC@Mail.Example>  ")).toBe(
      "abc@mail.example",
    );
    expect(normalizeMessageId("")).toBeNull();
    expect(normalizeMessageId(undefined)).toBeNull();
  });

  it("works out what a receipt shows", () => {
    expect(receiptKindOf({ fileKind: "pdf" })).toBe("pdf");
    expect(receiptKindOf({ fileKind: "email" })).toBe("email");
    expect(receiptKindOf({ imagePathname: "receipts/a/b.jpg" })).toBe("photo");
    expect(receiptKindOf({ fileKind: "exe", imagePathname: null })).toBe(
      "details",
    );
  });

  it("makes safe download names", () => {
    expect(downloadFilename("pdf", "Invoice 1042.pdf")).toBe(
      "Invoice 1042.pdf",
    );
    expect(downloadFilename("email", 'Your "bill" / Oct\r\n')).toBe(
      "Your bill Oct.html",
    );
    expect(downloadFilename("photo", null)).toBe("receipt.jpg");
    expect(downloadFilename("pdf", "../../etc/passwd")).toBe("etc passwd.pdf");
    expect(contentDisposition("attachment", "Café.pdf")).toBe(
      "attachment; filename=\"Café.pdf\"; filename*=UTF-8''Caf%C3%A9.pdf",
    );
  });
});

describe("receipt input", () => {
  it("still takes the old JPEG and text shape", () => {
    expect(
      receiptInputSchema.safeParse({ total: 1, image_jpeg_base64: "/9j/" })
        .success,
    ).toBe(true);
  });

  it("takes a PDF and the email", () => {
    const parsed = receiptInputSchema.parse({
      pdf_base64: "JVBERi0=",
      pdf_filename: "bill.pdf",
      email: {
        message_id: "<a@b>",
        subject: "Your bill",
        from: "billing@rogers.com",
        date: "2026-10-20",
        html: "<p>hi</p>",
      },
    });
    expect(parsed.email?.subject).toBe("Your bill");
  });

  it("rejects an oversized PDF or email", () => {
    expect(
      receiptInputSchema.safeParse({ pdf_base64: "A".repeat(4_200_001) })
        .success,
    ).toBe(false);
    expect(
      receiptInputSchema.safeParse({
        email: { html: "x".repeat(1_000_001) },
      }).success,
    ).toBe(false);
    expect(
      receiptInputSchema.safeParse({ email: { text: "x".repeat(200_001) } })
        .success,
    ).toBe(false);
  });

  it("needs exactly one target, and a month with a fixed bill", () => {
    const ok = (value: unknown) =>
      attachReceiptInputSchema.safeParse(value).success;
    expect(ok({ total: 1, expense_id: ID })).toBe(true);
    expect(ok({ total: 1, pending_id: ID })).toBe(true);
    expect(ok({ total: 1, fixed_bill_id: ID, month: "2026-10" })).toBe(true);
    expect(ok({ total: 1, fixed_bill_id: ID })).toBe(false);
    expect(ok({ total: 1, expense_id: ID, fixed_bill_id: ID })).toBe(false);
    expect(ok({ total: 1 })).toBe(false);
  });
});
