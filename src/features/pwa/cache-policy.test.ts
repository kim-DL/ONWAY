import { describe, expect, it } from "vitest";

import {
  PWA_CACHE_NAMES,
  isAppShellPath,
  isObsoleteOnnuriwayRuntimeCache,
  isPublicAssetPath,
  isSchoolThumbnailPath,
} from "./cache-policy";

describe("Phase 14 PWA cache allowlist", () => {
  it("only treats the root document as the app shell", () => {
    expect(isAppShellPath("/")).toBe(true);
    expect(isAppShellPath("/api/export")).toBe(false);
    expect(isAppShellPath("/__/functions/employeeLogin")).toBe(false);
  });

  it("allows hashed Next assets and explicit public PWA assets", () => {
    expect(isPublicAssetPath("/_next/static/chunks/app.js")).toBe(true);
    expect(isPublicAssetPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicAssetPath("/favicon.ico")).toBe(true);
    expect(isPublicAssetPath("/icons/onnuriway-icon-512-v2.png")).toBe(true);
    expect(isPublicAssetPath("/api/sales/export")).toBe(false);
    expect(isPublicAssetPath("/google.firestore.v1.Firestore/Listen/channel")).toBe(false);
  });

  it("keeps the future thumbnail route narrow and same-origin compatible", () => {
    expect(isSchoolThumbnailPath("/school-thumbnails/school-1/main.webp")).toBe(true);
    expect(isSchoolThumbnailPath("/photos/original/private.jpg")).toBe(false);
  });

  it("cleans only obsolete Onnuriway runtime caches", () => {
    expect(isObsoleteOnnuriwayRuntimeCache("app-shell-phase13")).toBe(true);
    expect(isObsoleteOnnuriwayRuntimeCache(PWA_CACHE_NAMES.appShell)).toBe(false);
    expect(isObsoleteOnnuriwayRuntimeCache("firebase-cache")).toBe(false);
  });
});
