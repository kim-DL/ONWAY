import { randomUUID } from "node:crypto";

import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

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
