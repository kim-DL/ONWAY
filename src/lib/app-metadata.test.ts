import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { APP_METADATA } from "./app-metadata";

describe("APP_METADATA", () => {
  it("keeps the public product identity stable", () => {
    expect(APP_METADATA.name).toBe("급식길");
    expect(APP_METADATA.description).toContain("대전 학교");
    expect(APP_METADATA.themeColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(APP_METADATA.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(APP_METADATA.buildVersion).toBe("2026.09.06");
  });

  it("uses the same background for the PWA launch and web entry surface", () => {
    const css = readFileSync(new URL("../app/styles/auth-loading.css", import.meta.url), "utf8");
    expect(APP_METADATA.backgroundColor).toBe("#f8fafc");
    expect(css).toContain(`background: ${APP_METADATA.backgroundColor};`);
  });
});
