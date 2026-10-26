import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return securityHeaderRules();
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
