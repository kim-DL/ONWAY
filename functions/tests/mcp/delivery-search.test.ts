import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerService } from "../../src/customer/customer-service.js";
import type { Customer } from "../../src/customer/customer-contract.js";
import { InventoryService } from "../../src/inventory/inventory-service.js";
import { DeliveryPhotoService } from "../../src/delivery-photo/delivery-photo-service.js";
import { EmployeeDirectory } from "../../src/employee/employee-directory.js";
import { McpQueries } from "../../src/mcp/queries.js";
import { recordSearchInput, latestEmployeeGalleryInput } from "../../src/mcp/contracts.js";
import { principal } from "./fixture.js";

afterEach(() => vi.restoreAllMocks());
const employee = { employeeId: "employee-a", displayName: "합성 기록자 과장" };
const photo = { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", customerId: "customer-z", deliveryDateKey: "2026-10-08",
  createdAt: "2026-10-07T15:10:00.000Z", createdByEmployeeId: employee.employeeId, createdByName: "등록 당시 이름",
  source: "camera" as const, expiresAt: "2026-10-14T15:10:00.000Z", thumbnail: { width: 40, height: 40 } };
function fixture() {
  const customers = new CustomerService(), photos = new DeliveryPhotoService(), employees = new EmployeeDirectory();
  const directory = vi.spyOn(employees, "resolve").mockResolvedValue({ employee, candidates: [employee], complete: true });
  const customerList = vi.spyOn(customers, "list");
  const customerRead = vi.spyOn(customers, "read").mockResolvedValue({ customerId: photo.customerId, name: "합성 최신업체" } as Customer);
  const names = vi.spyOn(customers, "readNames").mockResolvedValue([{ customerId: photo.customerId, name: "합성 최신업체" }]);
  const legacy = vi.spyOn(photos, "listPage");
  const direct = vi.spyOn(photos, "searchPage").mockResolvedValue({ photos: [photo], nextCursor: null, recordsScanned: 1 });
  const image = vi.spyOn(photos, "getWithMetadata").mockResolvedValue({ customerId: photo.customerId, createdByEmployeeId: photo.createdByEmployeeId,
    createdAt: photo.createdAt, createdByName: photo.createdByName, download: { photoId: photo.photoId, variant: "thumbnail",
      contentType: "image/webp", byteSize: 4, fileBase64: "UklGRg==" } });
  return { queries: new McpQueries(customers, new InventoryService(), photos, employees), directory, customerList, customerRead, names, legacy, direct, image };
}
describe("employee delivery query composition", () => {
  it("resolves one name and locates the latest customer directly, with a same-day employee gallery and first image", async () => {
    const f = fixture();
    const result = await f.queries.latestEmployeeGallery({ employeeName: "합성 기록자", limit: 50 }, principal);
    expect(result.resolution).toBe("resolved");
    expect(result.latestRecord).toMatchObject({ customerId: "customer-z", registeredAt: photo.createdAt, deliveryCompletedAt: null, recordedByName: "등록 당시 이름" });
    expect(result.gallery).toMatchObject({ customerId: "customer-z", date: "2026-10-08", employeeId: employee.employeeId, photos: [photo] });
    expect(result.initialPhoto).toMatchObject({ photoId: photo.photoId, variant: "thumbnail", fileBase64: "UklGRg==" });
    expect(f.direct.mock.calls.map(([input]) => input)).toEqual([
      { employeeId: employee.employeeId, limit: 1 },
      { employeeId: employee.employeeId, customerId: "customer-z", date: "2026-10-08", limit: 50 },
    ]);
    expect(f.direct.mock.calls[0]![2]).toEqual(f.direct.mock.calls[1]![2]);
    expect(f.customerRead).toHaveBeenCalledTimes(1); expect(f.image).toHaveBeenCalledTimes(1);
    expect(f.customerList).not.toHaveBeenCalled(); expect(f.legacy).not.toHaveBeenCalled();
  });
  it.each([
    [[], true, "employee_not_found"], [[employee, { employeeId: "second", displayName: employee.displayName }], true, "ambiguous_employee"],
    [[employee], false, "incomplete_employee_search"],
  ] as const)("does not guess a staff member or query photos for unresolved identity %#", async (candidates, complete, resolution) => {
    const f = fixture(); f.directory.mockResolvedValue({ employee: null, candidates: [...candidates], complete });
    const result = await f.queries.latestEmployeeGallery({ employeeName: "합성", limit: 50 }, principal);
    expect(result).toMatchObject({ resolution, latestRecord: null, gallery: null, initialPhoto: null });
    expect(f.direct).not.toHaveBeenCalled(); expect(f.customerList).not.toHaveBeenCalled();
  });
  it("keeps all filters and the raw cursor, batches names once and never downloads images during record search", async () => {
    const f = fixture(); const after = { createdAt: "2026-10-08T01:00:00.000Z", photoId: photo.photoId };
    const result = await f.queries.searchDeliveryRecords({ employeeName: "합성", customerId: photo.customerId, date: "2026-10-08", limit: 20, after }, principal);
    expect(result.filters).toEqual({ employeeId: employee.employeeId, customerId: photo.customerId, date: "2026-10-08" });
    expect(result.records).toEqual([{ photoId: photo.photoId, customerId: photo.customerId, customerName: "합성 최신업체",
      employeeId: employee.employeeId, recordedByName: photo.createdByName, registeredAt: photo.createdAt, deliveryCompletedAt: null }]);
    expect(f.direct).toHaveBeenCalledWith({ employeeId: employee.employeeId, customerId: photo.customerId, date: "2026-10-08", limit: 20, after }, principal, expect.anything());
    expect(f.names).toHaveBeenCalledTimes(1); expect(f.image).not.toHaveBeenCalled(); expect(f.customerList).not.toHaveBeenCalled();
    expect(result.page).toMatchObject({ complete: true, startedFromBeginning: false });
  });
  it("reports an incomplete scan separately from no records and can resume past expired rows", async () => {
    const f = fixture(); let count = 0;
    f.direct.mockImplementation(async () => ({ photos: [], recordsScanned: 1,
      nextCursor: { photoId: photo.photoId, createdAt: `2026-10-07T10:00:0${count++}.000Z` } }));
    const result = await f.queries.latestEmployeeGallery({ employeeId: employee.employeeId, limit: 50 }, principal);
    expect(result).toMatchObject({ resolution: "incomplete_records", gallery: null, recordsPage: { pagesScanned: 5, complete: false } });
    expect(result.nextCursor).not.toBeNull(); expect(f.image).not.toHaveBeenCalled();
    f.direct.mockResolvedValue({ photos: [], recordsScanned: 0, nextCursor: null });
    expect(await f.queries.latestEmployeeGallery({ employeeId: employee.employeeId, limit: 50, after: result.nextCursor! }, principal))
      .toMatchObject({ resolution: "no_records", recordsPage: { startedFromBeginning: false, complete: true } });
  });
  it("rejects a changed latest record rather than showing a stale latest-customer conclusion", async () => {
    const f = fixture();
    f.direct.mockResolvedValueOnce({ photos: [photo], nextCursor: null, recordsScanned: 1 }).mockResolvedValueOnce({ photos: [], nextCursor: null, recordsScanned: 0 });
    await expect(f.queries.latestEmployeeGallery({ employeeId: employee.employeeId, limit: 50 }, principal)).rejects.toMatchObject({ code: "aborted" });
  });
  it("supports unfiltered date search and rejects contradictory filters and impossible dates", () => {
    expect(recordSearchInput.parse({ date: "2026-10-08" }).limit).toBe(50);
    for (const input of [{ employeeName: "합성", employeeId: "one" }, { customerName: "합성", customerId: "one" }, { date: "2026-02-30" }, { limit: 101 }]) {
      expect(recordSearchInput.safeParse(input).success).toBe(false);
    }
    expect(latestEmployeeGalleryInput.safeParse({}).success).toBe(false);
  });
  it("defines a status/time index for every supported employee/customer equality combination", () => {
    const config = JSON.parse(readFileSync(new URL("../../../firestore.indexes.json", import.meta.url), "utf8"));
    for (const filter of [[], ["createdByEmployeeId"], ["customerId"], ["createdByEmployeeId", "customerId"]]) {
      expect(config.indexes).toContainEqual({ collectionGroup: "deliveryPhotos", queryScope: "COLLECTION", fields: [
        ...["status", ...filter].map((fieldPath) => ({ fieldPath, order: "ASCENDING" })),
        { fieldPath: "createdAt", order: "DESCENDING" }, { fieldPath: "__name__", order: "DESCENDING" },
      ] });
    }
  });
});
