/**
 * The public, canonical origin of the site, used for absolute URLs in
 * metadata (canonical links, Open Graph), robots.txt and the sitemap.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when set. Otherwise Vercel's production domain
 * (budget.patmac.ca), which Vercel sets on every deployment, previews included,
 * so a shared preview link still points search engines at production. Local
 * runs fall back to the production domain too.
 */
const FALLBACK_ORIGIN = "https://budget.patmac.ca";

export function siteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    FALLBACK_ORIGIN;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

export const SITE_NAME = "Budget";

export const SITE_DESCRIPTION =
  "Enter your fixed bills once, log take-home as it lands and spending as it happens. Budget does the subtraction and gives you one page at the end of the month.";

/**
 * Signed-in pages and APIs. They redirect to sign-in for crawlers anyway;
 * listing them in robots.txt keeps crawl budget on the public pages.
 */
export const PRIVATE_PATHS = [
  "/api/",
  "/accounts",
  "/expenses",
  "/fixed",
  "/goals",
  "/income",
  "/receipts",
  "/report",
  "/review",
  "/shell-check",
] as const;
