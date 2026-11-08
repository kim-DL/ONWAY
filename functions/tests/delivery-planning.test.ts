import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { invoiceAddressMatches, matchInvoice, splitInvoiceName } from "../src/delivery-planning/invoice-matching.js";
import { createPlanningProviders, invoiceImage, parseInvoiceResponse, parseTmapResponse, parseTmapTruckResponse, tmapRequest } from "../src/delivery-planning/planning-providers.js";
import { DEFAULT_DELIVERY_VEHICLE, planningSettingsDraftSchema, recommendRouteSchema, vehicleSchema, type InvoiceFields, type PlanningSettings } from "../src/delivery-planning/planning-contract.js";

const testImage = await sharp({ create: { width: 800, height: 1200, channels: 3, background: "white" } }).jpeg().toBuffer();

const fields: InvoiceFields = { recipientName: "소은푸드(금산)", recipientAddress: "안영동659-4", invoiceDate: "2026-11-07", uncertain: false };
const customer = { customerId: "example-1", name: "소은푸드", officialAddress: "대전 중구 안영동 659-4", deliveryAddress: "" };
const settings: PlanningSettings = { originAddress: "예시 회사", originPoint: { latitude: 36.3, longitude: 127.4 },
  vehicle: DEFAULT_DELIVERY_VEHICLE, revision: 1 };
const stops = [{ customerId: "a", latitude: 36.4, longitude: 127.5 }, { customerId: "b", latitude: 36.5, longitude: 127.6 }];
const tmap = { type: "FeatureCollection", properties: { totalTime: "1757", totalDistance: "6230" }, features: [
  { geometry: { type: "Point" }, properties: { index: "0", pointType: "S", viaPointId: "" } },
  { geometry: { type: "Point" }, properties: { index: "1", pointType: "B1", viaPointId: "a" } },
  { geometry: { type: "Point" }, properties: { index: "2", pointType: "E", viaPointId: "" } },
] };
const truckRoute = { type: "FeatureCollection", features: [
  { geometry: { type: "Point" }, properties: { totalTime: "488", totalDistance: "3161", pointType: "S" } },
  { geometry: { type: "Point" }, properties: { pointType: "N" } },
  { geometry: { type: "Point" }, properties: { pointType: "E" } },
] };
describe("invoice matching is conservative", () => {
  it("splits region and matches a uniquely corroborated address", () => {
    expect(splitInvoiceName(fields.recipientName)).toEqual({ base: "소은푸드", regionHint: "금산" });
    expect(matchInvoice(fields, [customer], fields.invoiceDate!)).toMatchObject({ customerId: "example-1", candidateIds: ["example-1"] });
  });
  it.each(["안영동 659-40", "안영동 659", "안영동 659-5", "다른동 659-4", "", "서울 중구 안영동 659-4"])("rejects conflicting address %s", (address) => {
    // A conflicting municipality is only comparable when both addresses name it.
    const target = address.startsWith("서울") ? "대전광역시 중구 안영동 659-4" : customer.officialAddress;
    expect(invoiceAddressMatches(address, target)).toBe(false);
  });
  it("does not automatically merge branches with exact names or duplicated addresses", () => {
    const branch = { ...customer, customerId: "branch", name: fields.recipientName, officialAddress: "다른동 1" };
    expect(matchInvoice(fields, [branch, customer], "2026-11-07").customerId).toBeNull();
    expect(matchInvoice(fields, [customer, { ...customer, customerId: "duplicate" }], "2026-11-07").customerId).toBeNull();
  });
  it.each([{ uncertain: true }, { invoiceDate: null }, { invoiceDate: "2026-11-09" }, { recipientName: "온누리종합식품" }])("requires review for %j", (change) => {
    expect(matchInvoice({ ...fields, ...change }, [customer], "2026-11-07").customerId).toBeNull();
  });
});
describe("provider privacy and route contracts", () => {
  it("uses Responses JSON schema, inline image, store false, with no tools", async () => {
    const evidence = { kind: "invoice", truncated: false, rows: [{
      supplier: { name: "온누리종합식품", address: "공급자 주소", businessNumber: "306-28-68765" },
      recipient: { name: fields.recipientName, address: fields.recipientAddress, businessNumber: "" },
      recipientRole: "공급받는자", date: fields.invoiceDate, dateUncertain: false, uncertain: fields.uncertain,
    }] };
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(evidence) }] }] }) }));
    const providers = createPlanningProviders({ openai: () => "test-key", tmap: () => "test-tmap" }, fetcher);
    expect(await providers.readInvoice(testImage)).toEqual(fields);
    const call = fetcher.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(call[0]![1].body));
    expect(call[0]![0]).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({ store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(body.tools).toBeUndefined(); expect(body.input[0].content[0].image_url).toBe(`data:image/jpeg;base64,${testImage.toString("base64")}`);
    expect(body.instructions).toContain("untrusted");
  });
  it("rejects incomplete output and refusal", () => {
    expect(() => parseInvoiceResponse({ status: "incomplete", output: [] })).toThrow();
    expect(() => parseInvoiceResponse({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] })).toThrow();
  });
  it("uses the standard Bongo height in cm, other truck parameters, and Seoul departure", () => {
    expect(tmapRequest(settings, stops, "b", new Date("2026-11-07T23:15:00Z"))).toMatchObject({ startTime: "202611080815", truckHeight: "240", truckWidth: "175", truckLength: "520", truckType: "1", truckWeight: "1000", truckTotalWeight: "4000", endX: "127.6", viaPoints: [{ viaPointId: "a" }] });
    expect(() => tmapRequest({ ...settings, originPoint: null }, stops, "b", new Date())).toThrow();
    expect(vehicleSchema.safeParse({ ...settings.vehicle, heightCm: 230 }).success).toBe(false);
  });
  it("accepts only origin settings and rejects client vehicle overrides", () => {
    const draft = { originAddress: settings.originAddress, originPoint: settings.originPoint };
    expect(planningSettingsDraftSchema.safeParse(draft).success).toBe(true);
    expect(planningSettingsDraftSchema.safeParse({ ...draft, vehicle: { ...DEFAULT_DELIVERY_VEHICLE, heightCm: 200 } }).success).toBe(false);
  });
  it("extracts returned order, time in seconds, and distance in metres", () => {
    expect(parseTmapResponse(tmap, stops, "b")).toEqual({ customerIds: ["a", "b"], totalSeconds: 1757, totalMeters: 6230 });
  });
  it("keeps the old company input unchanged and permits a distinct first customer", () => {
    const request = { requestId: "d777964b-4767-4d94-bdb2-237673803fb4", deliveryDateKey: "2026-11-08", expectedDayRevision: 2, lastCustomerId: "b" };
    expect(recommendRouteSchema.parse(request)).toEqual(request);
    expect(recommendRouteSchema.parse({ ...request, firstCustomerId: "a" })).toEqual({ ...request, firstCustomerId: "a" });
    expect(recommendRouteSchema.safeParse({ ...request, firstCustomerId: "b" }).success).toBe(false);
    expect(recommendRouteSchema.safeParse({ ...request, firstCustomerId: null }).success).toBe(false);
  });
  it("starts at the chosen customer without company coordinates or a duplicate via point", () => {
    const request = tmapRequest({ ...settings, originPoint: null }, stops, "b", new Date("2026-11-07T23:15:00Z"), "a");
    expect(request).toMatchObject({ startName: "first", startX: "127.5", startY: "36.4", endX: "127.6", endY: "36.5", viaPoints: [], truckHeight: "240" });
    expect(() => tmapRequest(settings, stops, "b", new Date(), "missing")).toThrow();
    expect(() => tmapRequest(settings, stops, "b", new Date(), "b")).toThrow();
  });
  it("restores fixed first and last customers around only the returned middle stops", () => {
    const direct = { ...tmap, features: [tmap.features[0], tmap.features[2]] };
    expect(parseTmapResponse(direct, stops, "b", "a")).toEqual({ customerIds: ["a", "b"], totalSeconds: 1757, totalMeters: 6230 });
    const three = [...stops, { customerId: "c", latitude: 36.6, longitude: 127.7 }];
    const response = { ...tmap, features: [tmap.features[0], { geometry: { type: "Point" }, properties: { index: 1, viaPointId: "b" } }, tmap.features[2]] };
    expect(tmapRequest(settings, three, "c", new Date(), "a").viaPoints.map(point => point.viaPointId)).toEqual(["b"]);
    expect(parseTmapResponse(response, three, "c", "a").customerIds).toEqual(["a", "b", "c"]);
    expect(() => parseTmapResponse(tmap, stops, "b", "a")).toThrow();
  });
  it("uses one truck route request for two fixed endpoints, with all vehicle restrictions", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => truckRoute }));
    const providers = createPlanningProviders({ openai: () => "unused", tmap: () => "route-key" }, fetcher);
    expect(await providers.optimize(settings, stops, "b", new Date(), "a")).toEqual({ customerIds: ["a", "b"], totalSeconds: 488, totalMeters: 3161 });
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(1); expect(calls[0]![0]).toBe("https://apis.openapi.sk.com/tmap/truck/routes?version=1");
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body).toMatchObject({ startX: "127.5", startY: "36.4", endX: "127.6", endY: "36.5", trafficInfo: "Y",
      truckHeight: "240", truckWidth: "175", truckLength: "520", truckType: "1", truckWeight: "1000", truckTotalWeight: "4000" });
    expect(body.viaPoints).toBeUndefined(); expect(body.startTime).toBeUndefined();
  });
  it("reads truck totals from the first feature and requires both route endpoints", () => {
    expect(parseTmapTruckResponse(truckRoute, "a", "b")).toEqual({ customerIds: ["a", "b"], totalSeconds: 488, totalMeters: 3161 });
    const numericRoute = { ...truckRoute, features: [{ ...truckRoute.features[0], properties: { pointType: "S", totalTime: 0, totalDistance: 0 } }, truckRoute.features[2]] };
    expect(parseTmapTruckResponse(numericRoute, "a", "b")).toEqual({ customerIds: ["a", "b"], totalSeconds: 0, totalMeters: 0 });
    for (const features of [[], [{ geometry: { type: "Point" }, properties: { pointType: "S" } }, truckRoute.features[2]],
      [{ ...truckRoute.features[0], properties: { ...truckRoute.features[0]!.properties, pointType: "N" } }, truckRoute.features[2]],
      [truckRoute.features[0], truckRoute.features[1]], [{ ...truckRoute.features[0], properties: { pointType: "S", totalTime: "invalid", totalDistance: "3161" } }, truckRoute.features[2]]]) {
      expect(() => parseTmapTruckResponse({ features }, "a", "b")).toThrow();
    }
  });
  it("does not retry a failed two-endpoint route through the optimizer", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
    const providers = createPlanningProviders({ openai: () => "unused", tmap: () => "route-key" }, fetcher);
    await expect(providers.optimize(settings, stops, "b", new Date(), "a")).rejects.toThrow("연결하지 못했습니다");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects missing, duplicated, unknown or end-less routes", () => {
    for (const features of [[], [...tmap.features, tmap.features[1]], tmap.features.slice(0, 2), [tmap.features[0], { geometry: { type: "Point" }, properties: { index: 1, viaPointId: "unknown" } }, tmap.features[2]]]) {
      expect(() => parseTmapResponse({ ...tmap, features }, stops, "b")).toThrow();
    }
  });
  it("does not retry or expose upstream errors", async () => {
    const fetcher = vi.fn(async () => { throw new Error("SECRET_IMAGE_DATA_AND_KEY"); });
    const providers = createPlanningProviders({ openai: () => "key", tmap: () => "key" }, fetcher);
    await expect(providers.readInvoice(testImage)).rejects.toThrow("자동 재요청은 하지 않았습니다");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("validates and rotates real image bytes entirely in memory", async () => {
    const jpeg = await sharp({ create: { width: 60, height: 90, channels: 3, background: "white" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await invoiceImage(jpeg.toString("base64"), "image/jpeg"); const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(90); expect(metadata.exif).toBeUndefined();
    await expect(invoiceImage(jpeg.toString("base64"), "image/png")).rejects.toThrow();
    await expect(invoiceImage("abcd%", "image/jpeg")).rejects.toThrow();
  });
});
