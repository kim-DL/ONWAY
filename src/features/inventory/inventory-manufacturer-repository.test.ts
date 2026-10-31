import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema } from "@/domain/inventory";
import { runRegisteredPrivateClientCleanups } from "@/features/auth/private-client-cleanup-registry";

const mock = vi.hoisted(() => ({ services: { auth: { currentUser: { uid: "employee-1" } as { uid: string } | null }, functions: {} }, invoke: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: () => mock.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => (input: unknown) => mock.invoke(name, input) }));
import { inventoryManufacturerRepository } from "./inventory-manufacturer-repository";
import { subscribeInventoryAccessFailure } from "./inventory-access-boundary";

const product = { ...inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "검증 상품", manufacturer: "정식 제조사", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 1, stockRevision: 0, hasHistory: false, quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z", createdBy: "EMP", updatedBy: "EMP" }), manufacturerId: "manufacturer-one" };
const namespace = "employee-1:1:1";
const manufacturer = { manufacturerId: "manufacturer-one", name: "온누리 식품", normalizedName: "온누리식품", active: true, revision: 1, createdAt: product.createdAt, createdBy: "EMP", updatedAt: product.updatedAt };

describe("inventory manufacturer repository", () => {
  it("keeps manufacturer references in both snapshots of committed registration detail", async () => {
    const detail = { product, lots: [] };
    mock.invoke.mockResolvedValueOnce({ data: { ...product, detail } });
    const input = { requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", productId: null, expectedRevision: null, includeDetail: true,
      draft: { name: product.name, manufacturer: product.manufacturer, manufacturerId: product.manufacturerId, specification: "", origin: "",
        unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated" as const, note: "", urgent: false } };
    await expect(inventoryManufacturerRepository.saveProduct(input)).resolves.toEqual({ ...product, detail });
    expect(mock.invoke).toHaveBeenCalledOnce();
    expect(mock.invoke.mock.calls[0]![1]).toMatchObject({ includeDetail: true, includeSummary: true, includeManufacturerReference: true });
  });
  it("notifies inventory cleanup on a revoked session without treating business rejection as access loss", async () => {
    const listener = vi.fn(); const unsubscribe = subscribeInventoryAccessFailure(listener);
    try {
      const business = { code: "functions/failed-precondition", message: "사진 업로드를 다시 확인해주세요." };
      mock.invoke.mockRejectedValueOnce(business);
      await expect(inventoryManufacturerRepository.reference("product-1")).rejects.toBe(business);
      expect(listener).not.toHaveBeenCalled();
      const revoked = { code: "functions/failed-precondition", message: "현재 세션을 확인할 수 없습니다." };
      mock.invoke.mockRejectedValueOnce(revoked);
      await expect(inventoryManufacturerRepository.reference("product-1")).rejects.toBe(revoked);
      expect(listener).toHaveBeenCalledWith(revoked, "employee-1");
    } finally { unsubscribe(); }
  });
  beforeEach(async () => { await runRegisteredPrivateClientCleanups(); mock.invoke.mockReset(); mock.services.auth.currentUser = { uid: "employee-1" }; });
  afterEach(() => { vi.useRealTimers(); });

  it("uses one bounded list callable and a request-id protected create callable", async () => {
    mock.invoke.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: { manufacturerId: "manufacturer-one", name: "온누리 식품", normalizedName: "온누리식품", active: true, revision: 1, createdAt: product.createdAt, createdBy: "EMP", updatedAt: product.updatedAt } });
    await inventoryManufacturerRepository.list(namespace);
    await inventoryManufacturerRepository.create({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", name: "  온누리  식품  " });
    expect(mock.invoke.mock.calls[0]).toEqual(["listInventoryManufacturers", {}]);
    expect(mock.invoke.mock.calls[1]![0]).toBe("createInventoryManufacturer");
    expect(mock.invoke.mock.calls[1]![1]).toEqual({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", name: "온누리 식품" });
  });

  it("shares an in-flight list request across development remounts", async () => {
    let resolveList!: (value: { data: [] }) => void;
    mock.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
    const first = inventoryManufacturerRepository.list(namespace);
    const second = inventoryManufacturerRepository.list(namespace);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    resolveList({ data: [] });
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  });

  it("reuses the session list for 60 seconds, including an empty list, and refreshes on expiry or demand", async () => {
    vi.useFakeTimers();
    mock.invoke.mockResolvedValueOnce({ data: [] }).mockResolvedValue({ data: [manufacturer] });
    expect(inventoryManufacturerRepository.cached(namespace)).toBeNull();
    await inventoryManufacturerRepository.list(namespace);
    expect(inventoryManufacturerRepository.cached(namespace)).toEqual([]);
    await inventoryManufacturerRepository.list(namespace);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await expect(inventoryManufacturerRepository.list(namespace)).resolves.toEqual([manufacturer]);
    expect(mock.invoke).toHaveBeenCalledTimes(2);
    await inventoryManufacturerRepository.list(namespace, { force: true });
    expect(mock.invoke).toHaveBeenCalledTimes(3);
  });

  it("keeps a usable snapshot after a refresh failure and lets the next request retry", async () => {
    const unavailable = { code: "functions/unavailable" };
    mock.invoke.mockResolvedValueOnce({ data: [manufacturer] }).mockRejectedValueOnce(unavailable).mockResolvedValueOnce({ data: [] });
    await inventoryManufacturerRepository.list(namespace);
    await expect(inventoryManufacturerRepository.list(namespace, { force: true })).rejects.toBe(unavailable);
    expect(inventoryManufacturerRepository.cached(namespace)).toEqual([manufacturer]);
    await expect(inventoryManufacturerRepository.list(namespace, { force: true })).resolves.toEqual([]);
  });

  it("isolates permission versions and cannot let an older request replace or deduplicate the new session", async () => {
    let resolveOld!: (value: { data: typeof manufacturer[] }) => void;
    mock.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ data: [] });
    const old = inventoryManufacturerRepository.list(namespace);
    const rejectedOld = expect(old).rejects.toMatchObject({ code: "unauthenticated" });
    const nextNamespace = "employee-1:1:2";
    expect(inventoryManufacturerRepository.cached(nextNamespace)).toBeNull();
    await expect(inventoryManufacturerRepository.list(nextNamespace)).resolves.toEqual([]);
    resolveOld({ data: [manufacturer] });
    await rejectedOld;
    expect(inventoryManufacturerRepository.cached(nextNamespace)).toEqual([]);
    expect(mock.invoke).toHaveBeenCalledTimes(2);
  });

  it("clears cached data on logout, account changes and revoked access", async () => {
    mock.invoke.mockResolvedValue({ data: [manufacturer] });
    await inventoryManufacturerRepository.list(namespace);
    mock.services.auth.currentUser = { uid: "employee-2" };
    expect(inventoryManufacturerRepository.cached(namespace)).toBeNull();
    mock.services.auth.currentUser = { uid: "employee-1" };
    await inventoryManufacturerRepository.list(namespace);
    await runRegisteredPrivateClientCleanups();
    expect(inventoryManufacturerRepository.cached(namespace)).toBeNull();
    await inventoryManufacturerRepository.list(namespace);
    const revoked = { code: "functions/permission-denied" };
    mock.invoke.mockRejectedValueOnce(revoked);
    await expect(inventoryManufacturerRepository.list(namespace, { force: true })).rejects.toBe(revoked);
    expect(inventoryManufacturerRepository.cached(namespace)).toBeNull();
    mock.services.auth.currentUser = null;
    await expect(inventoryManufacturerRepository.list(namespace)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("does not resurrect a cleared snapshot when a pending request completes after logout", async () => {
    let resolveList!: (value: { data: typeof manufacturer[] }) => void;
    mock.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
    const pending = inventoryManufacturerRepository.list(namespace);
    const rejected = expect(pending).rejects.toMatchObject({ code: "unauthenticated" });
    await runRegisteredPrivateClientCleanups();
    resolveList({ data: [manufacturer] });
    await rejected;
    expect(inventoryManufacturerRepository.cached(namespace)).toBeNull();
  });

  it("updates the snapshot only after confirmed create, rename and deactivation", async () => {
    const added = { ...manufacturer, manufacturerId: "manufacturer-two", name: "새 제조사", normalizedName: "새제조사" };
    mock.invoke.mockResolvedValueOnce({ data: [manufacturer] }).mockResolvedValueOnce({ data: added });
    await inventoryManufacturerRepository.list(namespace);
    await inventoryManufacturerRepository.create({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", name: added.name });
    expect(inventoryManufacturerRepository.cached(namespace)).toEqual(expect.arrayContaining([manufacturer, added]));
    const renamed = { ...manufacturer, name: "수정한 제조사", normalizedName: "수정한제조사", revision: 2 };
    mock.invoke.mockResolvedValueOnce({ data: renamed });
    await inventoryManufacturerRepository.update({ requestId: "51bd2065-a415-4e30-8b97-3dca1f8a66cc", manufacturerId: manufacturer.manufacturerId, expectedRevision: 1, name: renamed.name });
    expect(inventoryManufacturerRepository.cached(namespace)).toEqual(expect.arrayContaining([renamed, added]));
    mock.invoke.mockResolvedValueOnce({ data: { ...renamed, active: false, revision: 3 } });
    await inventoryManufacturerRepository.update({ requestId: "61bd2065-a415-4e30-8b97-3dca1f8a66cc", manufacturerId: manufacturer.manufacturerId, expectedRevision: 2, active: false });
    expect(inventoryManufacturerRepository.cached(namespace)?.filter((item) => item.active)).toEqual([added]);
  });

  it("prevents an older list response from restoring a manufacturer after confirmed deactivation", async () => {
    let resolveOld!: (value: { data: typeof manufacturer[] }) => void;
    mock.invoke.mockResolvedValueOnce({ data: [manufacturer] });
    await inventoryManufacturerRepository.list(namespace);
    mock.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const pending = inventoryManufacturerRepository.list(namespace, { force: true });
    mock.invoke.mockResolvedValueOnce({ data: { ...manufacturer, active: false, revision: 2 } });
    await inventoryManufacturerRepository.update({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", manufacturerId: manufacturer.manufacturerId, expectedRevision: 1, active: false });
    mock.invoke.mockResolvedValueOnce({ data: [] });
    resolveOld({ data: [manufacturer] });
    await expect(pending).resolves.toEqual([]);
    expect(inventoryManufacturerRepository.cached(namespace)).toEqual([]);
  });

  it("uses the existing admin update callable with revision and request-id protection", async () => {
    const updated = { manufacturerId: "manufacturer-one", name: "온누리 새 이름", normalizedName: "온누리새이름", active: true, revision: 2, createdAt: product.createdAt, createdBy: "EMP", updatedAt: product.updatedAt };
    mock.invoke.mockResolvedValueOnce({ data: updated });
    await expect(inventoryManufacturerRepository.update({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc",
      manufacturerId: "manufacturer-one", expectedRevision: 1, name: "  온누리  새 이름  " })).resolves.toEqual(updated);
    expect(mock.invoke).toHaveBeenCalledWith("updateInventoryManufacturer", {
      requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", manufacturerId: "manufacturer-one", expectedRevision: 1, name: "온누리 새 이름",
    });
  });

  it("opts in only for reference reads and manufacturer-aware saves, including explicit clear", async () => {
    mock.invoke.mockResolvedValueOnce({ data: { product, lots: [] } }).mockResolvedValueOnce({ data: product }).mockResolvedValueOnce({ data: { ...product, manufacturer: "", manufacturerId: undefined } });
    await expect(inventoryManufacturerRepository.reference(product.productId)).resolves.toMatchObject({ product: { manufacturerId: "manufacturer-one" } });
    const base = { requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", productId: product.productId, expectedRevision: 1,
      draft: { name: product.name, manufacturer: product.manufacturer, manufacturerId: product.manufacturerId, specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated" as const, note: "", urgent: false } };
    await inventoryManufacturerRepository.saveProduct(base);
    const clear = { ...base, requestId: "51bd2065-a415-4e30-8b97-3dca1f8a66cc", clearManufacturerReference: true,
      draft: { ...base.draft, manufacturer: "", manufacturerId: undefined } };
    await inventoryManufacturerRepository.saveProduct(clear);
    expect(mock.invoke.mock.calls[0]).toEqual(["getInventoryProduct", { productId: product.productId, includeManufacturerReference: true }]);
    expect(mock.invoke.mock.calls[1]![1]).toMatchObject({ includeManufacturerReference: true, draft: { manufacturerId: "manufacturer-one" } });
    expect(mock.invoke.mock.calls[2]![1]).toMatchObject({ includeManufacturerReference: true, clearManufacturerReference: true, draft: { manufacturer: "", manufacturerId: undefined } });
  });
});
