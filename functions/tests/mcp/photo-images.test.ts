import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { McpQueries } from "../../src/mcp/queries.js";
import { photoImages, photoImagesInput, PHOTO_IMAGES_MAX_BYTES } from "../../src/mcp/photo-images.js";
import { principal } from "./fixture.js";

afterEach(() => vi.restoreAllMocks());
const ids = ["c3bc6631-22fb-4f14-b622-bb852652c891", "d3bc6631-22fb-4f14-b622-bb852652c891", "e3bc6631-22fb-4f14-b622-bb852652c891"];
const createdAt = "2026-10-07T03:56:00.000Z";
const page = { returnedCount: 2, hasMore: false, complete: true, startedFromBeginning: true, pagesScanned: 1, recordsScanned: 2, stoppedBecause: "complete" as const };
const image = (photoId: string) => ({ photoId, variant: "evidence" as const, contentType: "image/webp" as const,
  customerId: "synthetic", customerName: "합성 업체", createdByEmployeeId: principal.employeeId,
  byteSize: 4, fileBase64: "UklGRg==", createdAt, createdByName: "합성 기록자" });
function fixture(photoIds = ids.slice(0, 2)) {
  const queries = new McpQueries();
  const gallery = vi.spyOn(queries, "customerGallery").mockResolvedValue({
    resolution: "resolved", candidates: [], match: null, searchPage: null, searchNextCursor: null, timeBasis: "photo_registered_at",
    customerId: "synthetic", customerName: "합성 업체", date: "2026-10-07", employeeId: null, initialPhoto: null,
    after: null, nextCursor: null, page: { ...page, returnedCount: photoIds.length, recordsScanned: photoIds.length },
    photos: photoIds.map((photoId) => ({ photoId, createdAt, createdByName: "이전 표시 이름" })), retentionHours: 168, evidence: "합성", note: "합성",
  });
  const photo = vi.spyOn(queries, "photo").mockImplementation(async (input) => image(input.photoId));
  return { queries, gallery, photo };
}
describe("standard MCP photo image response", () => {
  it("delivers checked large images once in record order, with checked captions and no widget or URL", async () => {
    const f = fixture();
    const result = await photoImages(photoImagesInput.parse({ source: "delivery", query: "합성", date: "2026-10-07" }), f.queries, principal);
    expect(f.gallery).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ query: "합성", limit: 3 }), principal, false);
    expect(f.photo.mock.calls.map(([input]) => input)).toEqual(ids.slice(0, 2).map((photoId) => ({ photoId, variant: "evidence" })));
    expect(result.structuredContent).toMatchObject({ imageCount: 2, totalImageBytes: 8, budgetLimited: false,
      delivery: { retentionHours: 168, page: { complete: true }, photoIds: ids.slice(0, 2) },
      photos: ids.slice(0, 2).map(() => ({ recordedByName: "합성 기록자", registeredAt: createdAt, deliveryCompletedAt: null })) });
    expect(result.content.filter((row) => row.type === "image")).toHaveLength(2);
    expect(JSON.stringify(result).match(/UklGRg==/g)).toHaveLength(2);
    expect(JSON.stringify(result.structuredContent)).not.toMatch(/UklGRg==|storagePath|https:|createdByEmployeeId/);
    expect(result._meta).toBeUndefined();
    expect(result.content[1]).toEqual({ type: "text", text: "합성 업체 · 등록 2026-10-07 12:56 (서울) · 합성 기록자" });
  });
  it("requests the existing product preview once, without stock details, catalog repetition or byte duplication", async () => {
    const queries = new McpQueries();
    const stock = vi.spyOn(queries, "product");
    const photo = vi.spyOn(queries, "inventoryPhoto").mockResolvedValue({ resolution: "resolved",
      product: { productId: "synthetic", name: "합성 만두", manufacturer: "합성", specification: "1kg", status: "active" },
      candidates: [], searchPage: null, searchNextCursor: null, note: "합성", image: { photoId: ids[0]!, variant: "preview", width: 1200, height: 800,
        contentType: "image/webp", byteSize: 4, fileBase64: "UklGRg==" } });
    const result = await photoImages(photoImagesInput.parse({ source: "inventory", query: "합성 만두" }), queries, principal);
    expect(photo).toHaveBeenCalledExactlyOnceWith({ query: "합성 만두", variant: "preview", afterId: null }, principal);
    expect(stock).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ imageCount: 1, inventory: { photo: { variant: "preview", sourceWidth: 1200 } }, photos: [{ registeredAt: null }] });
    expect(JSON.stringify(result).match(/UklGRg==/g)).toHaveLength(1);
    expect(result._meta).toBeUndefined();
  });
  it("omits photos deleted or expired during lookup but fails the entire batch on auth or association changes", async () => {
    const f = fixture();
    f.photo.mockRejectedValueOnce(new HttpsError("not-found", "expired"));
    const result = await photoImages(photoImagesInput.parse({ source: "delivery", customerId: "synthetic" }), f.queries, principal);
    expect(result.structuredContent).toMatchObject({ unavailablePhotoIds: [ids[0]], imageCount: 1, delivery: { photoIds: [ids[1]], page: { returnedCount: 1 } } });
    f.photo.mockRejectedValueOnce(new HttpsError("permission-denied", "revoked"));
    await expect(photoImages(photoImagesInput.parse({ source: "delivery", customerId: "synthetic" }), f.queries, principal)).rejects.toMatchObject({ code: "permission-denied" });
    for (const changes of [{ customerId: "other" }, { createdAt: "2026-10-06T03:56:00.000Z" }, { createdByEmployeeId: "other" }]) {
      f.photo.mockResolvedValueOnce({ ...image(ids[0]!), ...changes });
      await expect(photoImages(photoImagesInput.parse({ source: "delivery", customerId: "synthetic", employeeId: principal.employeeId }), f.queries, principal)).rejects.toMatchObject({ code: "aborted" });
    }
  });
  it("bounds total image bytes and resumes before the oversized next image without losing records", async () => {
    const f = fixture(ids);
    const byteSize = 7 * 1024 * 1024, fileBase64 = Buffer.alloc(byteSize).toString("base64");
    f.photo.mockImplementation(async (input) => ({ ...image(input.photoId), byteSize, fileBase64 }));
    const result = await photoImages(photoImagesInput.parse({ source: "delivery", customerId: "synthetic" }), f.queries, principal);
    expect(result.structuredContent).toMatchObject({ imageCount: 1, totalImageBytes: byteSize, budgetLimited: true,
      delivery: { nextCursor: { photoId: ids[0], createdAt }, page: { complete: false, hasMore: true, returnedCount: 1 } } });
    expect(byteSize).toBeLessThan(PHOTO_IMAGES_MAX_BYTES);
    expect(f.photo).toHaveBeenCalledTimes(2); // First non-fitting image checked; remaining images never downloaded.
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(28 * 1024 * 1024);
    const next = { photoId: ids[0]!, createdAt };
    await photoImages(photoImagesInput.parse({ source: "delivery", customerId: "synthetic", after: next }), f.queries, principal);
    expect(f.gallery).toHaveBeenLastCalledWith(expect.objectContaining({ after: next }), principal, false);
  });
  it("does not fetch images for unresolved searches and preserves search continuation", async () => {
    for (const resolution of ["ambiguous", "not_found", "incomplete_search"] as const) {
      const f = fixture([]);
      f.gallery.mockResolvedValueOnce({ ...await f.gallery.getMockImplementation()!({} as never, principal), resolution, customerId: null,
        page: null, searchNextCursor: resolution === "incomplete_search" ? "synthetic-next" : null });
      const result = await photoImages(photoImagesInput.parse({ source: "delivery", query: "합성" }), f.queries, principal);
      expect(result.structuredContent).toMatchObject({ imageCount: 0, delivery: { resolution } });
      expect(f.photo).not.toHaveBeenCalled();
    }
  });
  it("rejects incompatible filters, excess photos, invalid dates and mismatched image byte sizes", async () => {
    for (const input of [{}, { source: "inventory", query: "합성", productId: "p" }, { source: "inventory", query: "합성", date: "2026-10-07" },
      { source: "delivery", productId: "p", query: "합성" }, { source: "delivery", customerId: "c", afterId: "next" },
      { source: "delivery", query: "합성", limit: 6 }, { source: "delivery", query: "합성", date: "2026-02-30" },
      { source: "delivery", query: "합성", after: { photoId: ids[0], createdAt } }]) expect(photoImagesInput.safeParse(input).success).toBe(false);
    const f = fixture(); f.photo.mockResolvedValueOnce({ ...image(ids[0]!), byteSize: 5 });
    await expect(photoImages(photoImagesInput.parse({ source: "delivery", customerId: "synthetic" }), f.queries, principal)).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
