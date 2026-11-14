import { randomUUID } from "node:crypto";

import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Production already exposes both modes. Never silently compile them away.
if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "onnuriway") {
  for (const flag of ["NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS", "NEXT_PUBLIC_ENABLE_INVENTORY"]) {
    if (process.env[flag] !== "true") {
      throw new Error(`Production requires ${flag}=true. Use npm run build:hosting.`);
    }
  }
}

const pwaBuildRevision =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  (process.env.NODE_ENV === "development" ? "development" : randomUUID());

const withSerwist = withSerwistInit({
  additionalPrecacheEntries: [
    { url: "/", revision: pwaBuildRevision },
    { url: "/manifest.webmanifest", revision: pwaBuildRevision },
    { url: "/icons/onnuriway-company-icon-192-v4.png", revision: pwaBuildRevision },
    { url: "/icons/onnuriway-company-icon-512-v4.png", revision: pwaBuildRevision },
    { url: "/icons/onnuriway-company-icon-maskable-512-v4.png", revision: pwaBuildRevision },
    { url: "/icons/onnuriway-company-apple-touch-icon-v4.png", revision: pwaBuildRevision },
    { url: "/brand/onnuri-food-logo.png", revision: pwaBuildRevision },
    { url: "/brand/onnuri-food-logo-auth.webp", revision: pwaBuildRevision },
    { url: "/ui/mode-glass-three-v2.webp", revision: pwaBuildRevision },
    { url: "/ui/mode-glass-four-v2.webp", revision: pwaBuildRevision },
    { url: "/ui/delivery-invoice-stack.svg", revision: pwaBuildRevision },
    { url: "/ui/delivery-smart-route.svg", revision: pwaBuildRevision },
    ...["search", "route", "add", "organize", "done"].map((name) => ({
      url: `/ui/sales-${name}.svg`, revision: pwaBuildRevision,
    })),
    ...["search", "directory", "camera", "register"].map((name) => ({
      url: `/ui/customer-ceramic-${name}-v1.webp`, revision: pwaBuildRevision,
    })),
    { url: "/favicon.ico", revision: pwaBuildRevision },
  ],
  cacheOnNavigation: false,
  disable: process.env.NODE_ENV === "development",
  register: false,
  reloadOnOnline: false,
  scope: "/",
  swDest: "public/sw.js",
  swSrc: "src/app/sw.ts",
});

const nextConfig: NextConfig = {
  // The app uses Firebase callables for private data; no Next server is required.
  output: "export",
  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,
  webpack(config) {
    // Shared Functions contracts use NodeNext's .js specifiers; resolve their
    // TypeScript sources when bundling the browser, without changing Node output.
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".js", ".ts"] };
    return config;
  },
};

export default withSerwist(nextConfig);
