import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, siteOrigin } from "@/lib/site";

/** Served at /robots.txt. Only the public homepage and auth pages are crawlable. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_PATHS],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
