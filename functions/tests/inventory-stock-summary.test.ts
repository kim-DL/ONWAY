import { describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryLotSchema, inventoryProductSchema } from "../src/inventory/inventory-contract.js";
import { inventoryProductRecord, inventoryProductWire, inventorySummaryResponse, summarizeInventoryLotGroups } from "../src/inventory/inventory-stock-summary.js";
import { inventoryBackfillDiagnostic, inventoryCliGoogleAuth, inventorySummaryBackfillOptions } from "../../scripts/backfill-inventory-lot-summary.js";

const lot = inventoryLotSchema.parse({ lotId: "one-freezer1", productId: "one", locationId: "freezer1", originLotId: "one", quantity: 5,
  label: "", expiryState: "dated", expiryDate: "2027-01-01", revision: 1, createdAt: "2026-09-11T01:00:00Z", updatedAt: "2026-09-11T01:00:00Z" });
const product = inventoryProductSchema.parse({ productId: "one", companyId: "onnuri", name: "상품", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1,
  defaultLocationId: "freezer1", note: "", urgent: false, status: "active", revision: 1, stockRevision: 1, hasHistory: true,
  quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null),
  photo: null, createdAt: lot.createdAt, updatedAt: lot.updatedAt, createdBy: "staff", updatedBy: "staff" });

describe("inventory bounded summaries and strict legacy boundaries", () => {
  it("emits only bounded stage/category/codes, never arbitrary SDK messages or token-bearing data", () => {
    const failure = { name: "SdkError", code: 7, message: "PRIVATE_TOKEN account@example.com", response: { body: "PRIVATE_TOKEN" } };
    expect(inventoryBackfillDiagnostic(failure, "products-list")).toEqual({ status: "INVENTORY_BACKFILL_STOPPED", stage: "products-list", category: "firestore-grpc", code: 7 });
    expect(JSON.stringify(inventoryBackfillDiagnostic(failure, "products-list"))).not.toContain("PRIVATE_TOKEN");
    expect(inventoryBackfillDiagnostic({ code: "PRIVATE_TOKEN" }, "PRIVATE_TOKEN", 403)).toMatchObject({ stage: "unknown", code: "NOT_EXPOSED", httpStatus: 403 });
  });
  it("uses only the supplied CLI token callback even when ambient ADC points elsewhere", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "C:/not-a-real-credential-file.json");
    try {
      const provider = vi.fn(async () => ({ access_token: "synthetic-unit-test-token", expires_in: 3600 }));
      const auth = inventoryCliGoogleAuth(provider);
      expect(await auth.getProjectId()).toBe("onnuriway");
      expect(await auth.getAccessToken()).toBe("synthetic-unit-test-token");
      expect(provider).toHaveBeenCalledOnce();
      const headers = await (await auth.getClient()).getRequestHeaders("https://firestore.googleapis.com");
      const transmitted: Record<string, string> = {};
      headers.forEach((value, key) => { transmitted[key] = value; });
      expect(transmitted.authorization).toBe("Bearer synthetic-unit-test-token");
      expect(provider).toHaveBeenCalledOnce();
      expect(await auth.getAccessToken()).toBe("synthetic-unit-test-token");
      expect(provider).toHaveBeenCalledOnce();
    } finally { vi.unstubAllEnvs(); }
  });
  it("deduplicates the same expiry across locations and omits exhausted batches", () => {
    const summary = summarizeInventoryLotGroups([lot, { ...lot, lotId: "one-sample", locationId: "sample" },
      { ...lot, lotId: "two-freezer1", quantity: 0, expiryDate: "2027-02-01" }]);
    expect(summary.all).toEqual({ lotCount: 2, expiryCount: 1 });
    expect(summary.byLocation.freezer1).toEqual({ lotCount: 1, expiryCount: 1 });
    expect(summary.byLocation.sample).toEqual({ lotCount: 1, expiryCount: 1 });
    expect(summary.byLocation.refrigerated).toEqual({ lotCount: 0, expiryCount: 0 });
    expect(summarizeInventoryLotGroups([lot, { ...lot, lotId: "unknown", expiryState: "unknown", expiryDate: null },
      { ...lot, lotId: "none", expiryState: "not_applicable", expiryDate: null }]).all.expiryCount).toBe(3);
  });
  it("keeps old product documents unknown and strips only the recognized private ledger", () => {
    expect(inventoryProductWire(inventoryProductRecord(product))).not.toHaveProperty("lotSummary");
    const record = inventoryProductRecord({ ...product, inspectionByLot: { [lot.lotId]: { cycleId: "week-2026-09-11", quantity: 5,
      checkedAt: lot.createdAt, checkedBy: "staff", changed: false } } });
    expect(inventoryProductWire(record)).toEqual(product);
    expect(() => inventoryProductRecord({ ...product, inspectionByLot: { [lot.lotId]: { quantity: 5, privileged: true } } })).toThrow();
    expect(() => inventoryProductRecord({ ...product, unexpectedPrivateField: true })).toThrow();
  });
  it("omits summary recursively for old strict clients without mutating canonical product/receipts", () => {
    const expanded = { ...product, lotSummary: summarizeInventoryLotGroups([lot]) };
    const response = { product: expanded, detail: { product: expanded, lots: [lot] }, products: [expanded] };
    const legacy = inventoryProductSchema.omit({ lotSummary: true }).strict();
    const old = inventorySummaryResponse(response, false) as typeof response;
    expect(legacy.parse(old.product)).toEqual(product);
    expect(legacy.parse(old.detail.product)).toEqual(product);
    expect(legacy.parse(old.products[0])).toEqual(product);
    expect(response.product).toHaveProperty("lotSummary");
    expect(inventorySummaryResponse(response, true)).toBe(response);
  });
  it("requires explicit existing project/database and separate apply confirmation", () => {
    const target = ["--use-firebase-cli", "--project=onnuriway", "--database=(default)"];
    expect(inventorySummaryBackfillOptions(target)).toEqual({ apply: false, maxProducts: 1000 });
    expect(inventorySummaryBackfillOptions([...target, "--apply", "--confirm-project=onnuriway", "--max-products=500"])).toEqual({ apply: true, maxProducts: 500 });
    for (const args of [[], ["--project=other"], ["--project=onnuriway", "--database=(default)"], [...target, "--apply"], [...target, "--max-products=1001"], [...target, "--unknown"],
      [...target, "--apply", "--dry-run", "--confirm-project=onnuriway"], [...target, "--project=onnuriway"]]) {
      expect(() => inventorySummaryBackfillOptions(args)).toThrow();
    }
  });
});
