import "server-only";
import sanitizeHtml from "sanitize-html";

/*
 * A bill or receipt email, saved as the receipt when it had no attachment.
 * The HTML comes from whoever sent the email, so it is sanitized before it is
 * stored: no scripts, styles blocks, forms, frames or event handlers, and no
 * remote loads (images, fonts, CSS `url()`), which would leak that the user
 * opened it. The route that serves it adds a sandboxing CSP on top.
 */

const BLOCKED_STYLE =
  /url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:/i;

/** Drops CSS declarations that could load something or run script. */
export function safeStyle(style: string): string {
  return style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration && !BLOCKED_STYLE.test(declaration))
    .join("; ");
}

const INLINE_IMAGE =
  /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "center", "font"],
  allowedAttributes: {
    "*": [
      "style",
      "align",
      "valign",
      "width",
      "height",
      "bgcolor",
      "color",
      "dir",
      "title",
    ],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    table: ["border", "cellpadding", "cellspacing"],
    font: ["face", "size", "color"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Images only when inlined in the email: a remote one is a tracking pixel.
  allowedSchemesByTag: { img: ["data"] },
  allowProtocolRelative: false,
  transformTags: {
    "*": (tagName, attribs) => {
      const { style, ...rest } = attribs;
      const kept = style ? safeStyle(style) : "";
      return { tagName, attribs: kept ? { ...rest, style: kept } : rest };
    },
    a: (tagName, attribs) => {
      const { style, ...rest } = attribs;
      const kept = style ? safeStyle(style) : "";
      return {
        tagName,
        attribs: {
          ...rest,
          ...(kept ? { style: kept } : {}),
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      };
    },
  },
  // An image with no (or a remote) source would show as broken: drop it.
  exclusiveFilter: (frame) =>
    frame.tag === "img" && !INLINE_IMAGE.test(frame.attribs.src ?? ""),
};

/** The email's HTML with everything unsafe or remote removed. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type EmailCopy = {
  subject: string | null;
  from: string | null;
  date: string | null;
  html: string | null;
  text: string | null;
};

/**
 * The saved copy of an email: a small header (subject, sender, date) and the
 * sanitized HTML body, or the plain-text body when there is no HTML.
 */
export function emailDocument(email: EmailCopy): string {
  const subject = email.subject?.trim() || "Receipt email";
  const header = [
    `<h1>${escapeHtml(subject)}</h1>`,
    email.from ? `<p><b>From:</b> ${escapeHtml(email.from)}</p>` : "",
    email.date ? `<p><b>Date:</b> ${escapeHtml(email.date)}</p>` : "",
  ].join("");
  const body = email.html?.trim()
    ? sanitizeEmailHtml(email.html)
    : `<pre>${escapeHtml(email.text ?? "")}</pre>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(subject)}</title>
<style>
body { margin: 0; padding: 16px; font: 14px/1.5 system-ui, sans-serif; color: #111; background: #fff; }
.budget-email-header { border-bottom: 1px solid #ddd; margin-bottom: 16px; padding-bottom: 8px; }
.budget-email-header h1 { font-size: 18px; margin: 0 0 4px; }
.budget-email-header p { margin: 0; color: #555; }
pre { white-space: pre-wrap; word-break: break-word; font: inherit; }
img { max-width: 100%; height: auto; }
</style>
</head>
<body>
<header class="budget-email-header">${header}</header>
<main>${body}</main>
</body>
</html>
`;
}

export { EMAIL_CONTENT_SECURITY_POLICY } from "@/lib/security-headers";
