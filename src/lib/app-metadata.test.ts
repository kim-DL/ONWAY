import { describe, expect, it } from "vitest";

import { APP_METADATA } from "./app-metadata";

describe("APP_METADATA", () => {
  it("keeps the public product identity stable", () => {
    expect(APP_METADATA.name).toBe("급식길");
    expect(APP_METADATA.description).toContain("대전 학교");
    expect(APP_METADATA.themeColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(APP_METADATA.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(APP_METADATA.buildVersion).toBe("phase16");
  });
});
