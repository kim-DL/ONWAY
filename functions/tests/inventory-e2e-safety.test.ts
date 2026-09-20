import { describe, expect, it } from "vitest";
import { assertInventoryE2EEnvironment, groupInventoryE2EPageSequences, INVENTORY_E2E_PROJECT } from "../../scripts/inventory-e2e-safety";

const safe = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "test", INVENTORY_E2E: "true", FIREBASE_PROJECT_ID: INVENTORY_E2E_PROJECT,
  GCLOUD_PROJECT: INVENTORY_E2E_PROJECT, NEXT_PUBLIC_FIREBASE_PROJECT_ID: INVENTORY_E2E_PROJECT,
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_ENABLE_INVENTORY: "true",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
});

describe("independent inventory UI pagination sequences", () => {
  const page = (afterId: string | null, nextCursor: string | null, identity = "") => ({ afterId, nextCursor, identity });
  it("verifies one complete list", () => {
    const pages = [page(null, "a"), page("a", "b"), page("b", null)];
    expect(groupInventoryE2EPageSequences(pages)).toEqual([pages]);
  });
  it("keeps concurrent StrictMode lists independent instead of dropping duplicate pages", () => {
    const pages = [page(null, "a", "one"), page(null, "a", "two"), page("a", "b", "one"), page("a", "b", "two"), page("b", null, "one"), page("b", null, "two")];
    expect(groupInventoryE2EPageSequences(pages).map((sequence) => sequence.map((item) => item.identity))).toEqual([["one", "one", "one"], ["two", "two", "two"]]);
  });
  it("allows one list to finish before the overlapping list", () => {
    const pages = [page(null, "a"), page(null, "a"), page("a", "b"), page("b", null), page("a", "b"), page("b", null)];
    expect(groupInventoryE2EPageSequences(pages)).toHaveLength(2);
  });
  it.each([
    [], [page("orphan", null)], [page(null, "missing")],
    [page(null, "a"), page("a", "a")],
    [page(null, "a"), page(null, "a"), page("a", null)],
    [page(null, null), page("extra", null)],
  ])("rejects incomplete, orphaned, or cyclic lists %#", (pages) => {
    expect(() => groupInventoryE2EPageSequences(pages)).toThrow();
  });
});
describe("inventory UI harness production-isolation guard", () => {
  it("accepts only the dedicated demo configuration", () => {
    expect(() => assertInventoryE2EEnvironment(safe())).not.toThrow();
    expect(() => assertInventoryE2EEnvironment({ ...safe(), FIREBASE_CONFIG: JSON.stringify({ projectId: INVENTORY_E2E_PROJECT, storageBucket: `${INVENTORY_E2E_PROJECT}.appspot.com` }) })).not.toThrow();
  });
  it.each(Object.keys(safe()).filter((key) => key !== "NODE_ENV"))("fails closed when %s is absent or different", (key) => {
    const environment = safe(); delete environment[key];
    expect(() => assertInventoryE2EEnvironment(environment)).toThrow();
    environment[key] = "unsafe";
    expect(() => assertInventoryE2EEnvironment(environment)).toThrow();
  });
  it.each(["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN"])("refuses inherited %s", (key) => {
    expect(() => assertInventoryE2EEnvironment({ ...safe(), [key]: "must-not-be-used" })).toThrow();
  });
  it.each([
    { projectId: "production-project", storageBucket: `${INVENTORY_E2E_PROJECT}.appspot.com` },
    { projectId: INVENTORY_E2E_PROJECT, storageBucket: "production-bucket.firebasestorage.app" },
    { projectId: INVENTORY_E2E_PROJECT },
  ])("rejects unsafe Firebase configuration %j", (config) => {
    expect(() => assertInventoryE2EEnvironment({ ...safe(), FIREBASE_CONFIG: JSON.stringify(config) })).toThrow();
  });
});
