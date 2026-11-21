import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

/**
 * Served at /sitemap.xml. Everything else is behind sign-in, so the public
 * site is the homepage (signed-out "/" renders /welcome) and the sign-up page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return [
    { url: `${origin}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${origin}/sign-up`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
