export const PWA_CACHE_VERSION = "phase14";

export const PWA_CACHE_NAMES = {
  appShell: `app-shell-${PWA_CACHE_VERSION}`,
  publicAssets: `public-assets-${PWA_CACHE_VERSION}`,
  schoolThumbnails: `school-thumbnails-${PWA_CACHE_VERSION}`,
} as const;

const PUBLIC_ASSET_PATHS = new Set([
  "/favicon.ico",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
]);

export function isAppShellPath(pathname: string) {
  return pathname === "/";
}

export function isPublicAssetPath(pathname: string) {
  return pathname.startsWith("/_next/static/") || PUBLIC_ASSET_PATHS.has(pathname);
}

export function isSchoolThumbnailPath(pathname: string) {
  return pathname.startsWith("/school-thumbnails/");
}

export function isKnownRuntimeCacheName(cacheName: string) {
  return Object.values(PWA_CACHE_NAMES).includes(cacheName as (typeof PWA_CACHE_NAMES)[keyof typeof PWA_CACHE_NAMES]);
}

export function isObsoleteOnnuriwayRuntimeCache(cacheName: string) {
  return /^(app-shell|public-assets|school-thumbnails)-phase\d+$/.test(cacheName)
    && !isKnownRuntimeCacheName(cacheName);
}
