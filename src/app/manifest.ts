import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest, so Budget can be
 * installed to the home screen and open like an app. Icons are the existing
 * app/icon.svg and app/apple-icon.png. There is deliberately no service
 * worker: nothing signed-in or financial is cached offline.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Budget",
    short_name: "Budget",
    description:
      "Monthly budget: fixed bills, take-home pay, spending and reports.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Scan a receipt",
        short_name: "Scan",
        description: "Open Spending to scan a receipt or add an expense.",
        url: "/expenses",
        icons: [
          { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      {
        name: "Monthly report",
        short_name: "Report",
        url: "/report",
        icons: [
          { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
    ],
  };
}
