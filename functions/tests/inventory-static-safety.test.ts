import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertStaticInventoryClientBundle, assertStaticInventoryEnvironment, prepareStaticInventoryApp, removeStaticInventoryApp } from "../../scripts/run-inventory-e2e-static.mjs";

const safe = () => ({ INVENTORY_E2E: "true", INVENTORY_E2E_STATIC: "true", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-inventory-e2e",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-inventory-e2e.firebaseapp.com",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_ENABLE_INVENTORY: "true",
  NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "", NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY: "" });
const client = 'projectId:"demo-inventory-e2e",apiKey:"demo-api-key",authDomain:"demo-inventory-e2e.firebaseapp.com"';
describe("isolated static inventory production-build safety", () => {
  it("accepts the exact emulator-only environment and bundle", () => {
    expect(() => assertStaticInventoryEnvironment(safe())).not.toThrow();
    expect(() => assertStaticInventoryClientBundle(client)).not.toThrow();
  });
  it.each(Object.keys(safe()))("rejects unsafe %s", (key) => {
    expect(() => assertStaticInventoryEnvironment({ ...safe(), [key]: "production-value" })).toThrow();
  });
  it.each(["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN"])("rejects production credential %s", (key) => {
    expect(() => assertStaticInventoryEnvironment({ ...safe(), [key]: "secret" })).toThrow();
  });
  it.each(['projectId:"onnuriway"', 'authDomain:"onnuriway.firebaseapp.com"', `AIza${"a".repeat(35)}`])("rejects production material in otherwise-demo bundle %s", (suffix) => {
    expect(() => assertStaticInventoryClientBundle(client + suffix)).toThrow();
  });
  it("removes only the exact owned static root and preserves the runtime and sibling evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "inventory-static-cleanup-"));
    const runtime = join(root, "output/playwright/inventory-runtime");
    try {
      mkdirSync(runtime, { recursive: true });
      const owned = mkdtempSync(join(runtime, "static-app-"));
      const sibling = mkdtempSync(join(runtime, "static-app-"));
      const evidence = join(runtime, "static-build-verification.json");
      writeFileSync(join(owned, "built.txt"), "owned");
      writeFileSync(join(sibling, "built.txt"), "other run");
      writeFileSync(evidence, "evidence");
      expect(() => removeStaticInventoryApp(root, runtime, owned)).not.toThrow();
      expect(existsSync(owned)).toBe(false);
      expect(existsSync(runtime)).toBe(true);
      expect(existsSync(sibling)).toBe(true);
      expect(existsSync(evidence)).toBe(true);
      expect(() => removeStaticInventoryApp(root, runtime, runtime)).toThrow();
      expect(() => removeStaticInventoryApp(root, runtime, join(sibling, "nested"))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("cleans its newly created root when preparation fails before the build", () => {
    const root = mkdtempSync(join(tmpdir(), "inventory-static-prepare-"));
    const runtime = join(root, "output/playwright/inventory-runtime");
    try {
      mkdirSync(runtime, { recursive: true });
      const evidence = join(runtime, "static-build-verification.json");
      writeFileSync(evidence, "previous evidence");
      expect(() => prepareStaticInventoryApp(root, runtime, safe())).toThrow();
      expect(existsSync(evidence)).toBe(true);
      expect(existsSync(runtime)).toBe(true);
      expect(existsSync(join(root, "output/playwright"))).toBe(true);
      expect(existsSync(join(root, "output"))).toBe(true);
      expect(existsSync(root)).toBe(true);
      expect(existsSync(join(runtime, "src"))).toBe(false);
      expect(readdirSync(runtime).filter((name) => name.startsWith("static-app-"))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
