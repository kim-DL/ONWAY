import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema } from "../src/inventory/inventory-contract.js";
import { defaultInventorySettings } from "../src/inventory/inventory-calendar.js";
import { summarizeInventoryLotGroups } from "../src/inventory/inventory-stock-summary.js";

const fixture = vi.hoisted(() => ({ authorize: vi.fn(), save: vi.fn(), count: vi.fn(), status: vi.fn(), settings: vi.fn(), trace: [] as string[] }));
vi.mock("../src/inventory/inventory-authorization.js", () => ({
  requireInventoryActor: fixture.authorize, inventoryActorCanWrite: () => true,
}));
vi.mock("../src/inventory/inventory-service.js", () => ({ InventoryService: class {
  save = fixture.save;
  count = fixture.count;
  status = fixture.status;
  updateSettings = fixture.settings;
} }));
import { deleteInventoryProduct, recordInventoryCount, saveInventoryProduct, setInventoryProductStatus, updateInventorySettings } from "../src/inventory/callables.js";

const actor = { uid: "uid-stock", employeeId: "EMP-STOCK", roleScopes: ["delivery"], isAdmin: false,
  sessionVersion: 1, permissionsVersion: 1 };
const requestId = "eac0f1a2-966f-4c3b-bc40-fd477fe5cd03";
const draft = { name: "검증 상품", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 8,
  defaultLocationId: "freezer1" as const, note: "", urgent: false };
const product = inventoryProductSchema.parse({ ...draft, productId: "product-one", companyId: "onnuri", status: "active",
  revision: 1, stockRevision: 0, hasHistory: true, quantityByLocation: inventoryLocationMap(0),
  nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null,
  createdAt: "2026-09-11T01:00:00.000Z", updatedAt: "2026-09-11T01:00:00.000Z", createdBy: actor.employeeId, updatedBy: actor.employeeId });
const input = { requestId, productId: null, expectedRevision: null, draft };
const countInput = { requestId, productId: product.productId, expectedStockRevision: 0,
  locationId: "freezer1", cycleId: "week-2026-09-11", counts: [], reason: "", includeDetail: true };
function request(data: unknown) {
  const headers = vi.fn();
  return { headers, value: { data, rawRequest: { res: { setHeader: headers } } } as unknown as CallableRequest<unknown> };
}
beforeEach(() => {
  vi.clearAllMocks(); fixture.trace.length = 0;
  fixture.authorize.mockImplementation(async () => { fixture.trace.push("authorize"); return actor; });
  fixture.save.mockImplementation(async () => { fixture.trace.push("commit"); return product; });
});

describe("inventory callable confirmation and privacy boundaries", () => {
  it.each([false, true])("adds a validated lot summary only for opted-in strict clients (includeSummary=%s)", async (includeSummary) => {
    const expanded = { ...product, lotSummary: summarizeInventoryLotGroups([]) };
    fixture.save.mockResolvedValueOnce(expanded);
    const result = await saveInventoryProduct.run(request({ ...input, ...(includeSummary ? { includeSummary } : {}) }).value);
    expect(result).toEqual(includeSummary ? expanded : product);
    if (!includeSummary) expect(inventoryProductSchema.omit({ lotSummary: true }).strict().parse(result)).toEqual(product);
    expect(expanded).toHaveProperty("lotSummary");
    expect(fixture.authorize.mock.calls.map((call) => call[1])).toEqual(["write", "write"]);
  });
  it.each([false, true])("authorizes both lifecycle mutation boundaries as write, not admin (delete=%s)", async (deleted) => {
    const result = { ...product, status: deleted ? "deleted" : "inactive" };
    fixture.status.mockResolvedValueOnce(result);
    const input = { requestId, productId: product.productId, expectedRevision: product.revision, reason: "품목 정리",
      ...(deleted ? {} : { status: "inactive" }) };
    const { value, headers } = request(input);
    expect(await (deleted ? deleteInventoryProduct : setInventoryProductStatus).run(value)).toEqual(result);
    expect(fixture.authorize.mock.calls.map((call) => call[1])).toEqual(["write", "write"]);
    expect(fixture.status.mock.calls[0]![0]).toEqual(input);
    expect(fixture.status.mock.calls[0]![1]).toEqual(actor);
    expect(fixture.status.mock.calls[0]![2]).toBe(deleted ? true : undefined);
    expect(headers).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
  });
  it("retains administrator-only authority for inventory settings", async () => {
    const settings = defaultInventorySettings(); fixture.settings.mockResolvedValueOnce(settings);
    expect(await updateInventorySettings.run(request({ requestId, expectedRevision: 0, weekday: 5, urgentDays: 100 }).value)).toEqual(settings);
    expect(fixture.authorize.mock.calls.map((call) => call[1])).toEqual(["admin", "admin"]);
  });
  it("validates authority before and after a confirmed write without changing the legacy product result", async () => {
    const { value, headers } = request(input);
    expect(await saveInventoryProduct.run(value)).toEqual(product);
    expect(fixture.trace).toEqual(["authorize", "commit", "authorize"]);
    expect(fixture.authorize.mock.calls.map((call) => call[1])).toEqual(["write", "write"]);
    expect(headers).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
    expect(headers).toHaveBeenCalledWith("Pragma", "no-cache");
  });
  it("does not call the stock service after the preflight authorization is denied", async () => {
    const { HttpsError } = await import("firebase-functions/v2/https");
    fixture.authorize.mockRejectedValueOnce(new HttpsError("permission-denied", "권한 없음"));
    await expect(saveInventoryProduct.run(request(input).value)).rejects.toMatchObject({ code: "permission-denied" });
    expect(fixture.save).not.toHaveBeenCalled();
  });
  it("does not release private data if authority is revoked while the write is in progress", async () => {
    const { HttpsError } = await import("firebase-functions/v2/https");
    fixture.authorize.mockResolvedValueOnce(actor).mockRejectedValueOnce(new HttpsError("permission-denied", "권한 만료"));
    await expect(saveInventoryProduct.run(request(input).value)).rejects.toMatchObject({ code: "permission-denied" });
    expect(fixture.save).toHaveBeenCalledOnce();
    expect(fixture.authorize).toHaveBeenCalledTimes(2);
  });
  it("waits for the write and final authorization before reporting success", async () => {
    let finishWrite!: (value: unknown) => void;
    let finishAuthorization!: (value: unknown) => void;
    fixture.save.mockImplementationOnce(() => new Promise((resolve) => { finishWrite = resolve; }));
    fixture.authorize.mockResolvedValueOnce(actor).mockImplementationOnce(() => new Promise((resolve) => { finishAuthorization = resolve; }));
    let completed = false;
    const pending = saveInventoryProduct.run(request(input).value).then((value) => { completed = true; return value; });
    await vi.waitFor(() => expect(fixture.save).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    finishWrite(product);
    await vi.waitFor(() => expect(fixture.authorize).toHaveBeenCalledTimes(2));
    expect(completed).toBe(false);
    finishAuthorization(actor);
    expect(await pending).toEqual(product);
  });
  it("validates the optional working set through the same private, post-authorization response boundary", async () => {
    const result = { product, replayed: false, detail: { product, lots: [] }, event: {
      eventId: requestId, productId: product.productId, kind: "count_match", locationId: "freezer1", lines: [],
      reason: "", actorEmployeeId: actor.employeeId, createdAt: "2026-09-11T01:00:00.000Z",
      cycleId: "week-2026-09-11", unitLabel: "봉", unitsPerBox: 8, stockRevision: 0,
    } };
    fixture.count.mockResolvedValueOnce(result);
    const { value, headers } = request(countInput);
    expect(await recordInventoryCount.run(value)).toEqual(result);
    expect(fixture.count).toHaveBeenCalledWith(countInput, actor);
    expect(fixture.authorize).toHaveBeenCalledTimes(2);
    expect(headers).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
  });
});
