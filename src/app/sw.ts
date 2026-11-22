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
import { claimPush, readBinding } from "@/features/inventory-notices/device-binding";
import { appRelease, releaseNotesRequest } from "@/features/pwa/release-notes";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("message", (event) => {
  if (event.data === releaseNotesRequest) event.ports[0]?.postMessage(appRelease);
});

self.addEventListener("push", event => {
  if (!event.data) return;
  const data = event.data.json();
  if (data?.type !== "inventory-notice" || typeof data.binding !== "string" || typeof data.id !== "string") return;
  event.waitUntil((async () => {
    if (!await claimPush(data.binding, data.id)) return;
    const windows = await self.clients.matchAll({type:"window"});
    const focused = windows.some(client => client.visibilityState === "visible" && client.focused);
    await self.registration.showNotification("급식길 · 새 재고 알림", {
      silent: focused, body:"알림함에서 상품과 변경 수량을 확인하세요.",tag:"inventory-"+data.id,
      icon:"/icons/onnuriway-company-icon-192-v4.png",data:{inventory:true,binding:data.binding},
    });
  })());
});
self.addEventListener("notificationclick", event => {
  if (!event.notification.data?.inventory) return;
  event.notification.close();
  event.waitUntil((async () => {
    if ((await readBinding())?.id !== event.notification.data.binding) return;
    const windows=await self.clients.matchAll({type:"window"});
    const client=windows.find(w=>new URL(w.url).origin===self.location.origin);
    if (client) { await client.focus(); client.postMessage("OPEN_INVENTORY_INBOX"); }
    else await self.clients.openWindow("/?inventoryInbox=1");
  })());
});

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
