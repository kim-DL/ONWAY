/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
} from "serwist";

import {
  PWA_CACHE_NAMES,
  isAppShellPath,
  isObsoleteOnnuriwayRuntimeCache,
  isPublicAssetPath,
  isSchoolThumbnailPath,
} from "@/features/pwa/cache-policy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  precacheOptions: {
    cacheName: PWA_CACHE_NAMES.appShell,
    cleanupOutdatedCaches: true,
  },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ request, url, sameOrigin }) => (
        sameOrigin
        && request.mode === "navigate"
        && request.destination === "document"
        && isAppShellPath(url.pathname)
      ),
      handler: new NetworkFirst({
        cacheName: PWA_CACHE_NAMES.appShell,
        networkTimeoutSeconds: 3,
      }),
    },
    {
      matcher: ({ request, url, sameOrigin }) => (
        sameOrigin
        && request.method === "GET"
        && isPublicAssetPath(url.pathname)
      ),
      handler: new CacheFirst({
        cacheName: PWA_CACHE_NAMES.publicAssets,
        plugins: [
          new ExpirationPlugin({ maxEntries: 96, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
    {
      matcher: ({ request, url, sameOrigin }) => (
        sameOrigin
        && request.method === "GET"
        && request.destination === "image"
        && isSchoolThumbnailPath(url.pathname)
      ),
      handler: new CacheFirst({
        cacheName: PWA_CACHE_NAMES.schoolThumbnails,
        plugins: [
          new ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 14 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter(isObsoleteOnnuriwayRuntimeCache)
        .map((cacheName) => caches.delete(cacheName)),
    )),
  );
});

serwist.addEventListeners();
