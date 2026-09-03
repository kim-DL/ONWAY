import type { MetadataRoute } from "next";

import { APP_METADATA } from "@/lib/app-metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_METADATA.name,
    short_name: APP_METADATA.shortName,
    description: APP_METADATA.description,
    lang: "ko-KR",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: APP_METADATA.backgroundColor,
    theme_color: APP_METADATA.themeColor,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/onnuriway-icon-192-v2.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/onnuriway-icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/onnuriway-icon-maskable-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
