import { describe, expect, it } from "vitest";
import { assertStaticInventoryClientBundle, assertStaticInventoryEnvironment } from "../../scripts/run-inventory-e2e-static.mjs";

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
});
