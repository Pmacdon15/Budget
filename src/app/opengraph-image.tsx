import { ImageResponse } from "next/og";

/*
 * The image shown when a Budget link is shared (Open Graph and, as a
 * fallback, X/Twitter cards). Generated at build time; no fonts or
 * request data, so it prerenders.
 */
export const alt = "Budget — know what’s left before the month does";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#ffffff",
        color: "#171717",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <svg
          width="88"
          height="88"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <rect width="32" height="32" rx="9" fill="#171717" />
          <path
            d="M9 21.5 13.5 16l3.5 3 6-7.5"
            stroke="#fafafa"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="23" cy="11.5" r="1.9" fill="#fafafa" />
        </svg>
        <div style={{ fontSize: 48, fontWeight: 600 }}>Budget</div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 84,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -3,
          maxWidth: 1000,
        }}
      >
        Know what’s left before the month does.
      </div>
      <div style={{ display: "flex", fontSize: 32, color: "#525252" }}>
        Fixed bills, take-home pay and spending — one page a month.
      </div>
    </div>,
    size,
  );
}
