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
    { url: "/icons/icon-192.png", revision: pwaBuildRevision },
    { url: "/icons/icon-512.png", revision: pwaBuildRevision },
    { url: "/icons/icon-maskable-512.png", revision: pwaBuildRevision },
    { url: "/icons/apple-touch-icon.png", revision: pwaBuildRevision },
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
  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withSerwist(nextConfig);
