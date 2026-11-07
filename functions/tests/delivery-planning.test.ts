import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { invoiceAddressMatches, matchInvoice, splitInvoiceName } from "../src/delivery-planning/invoice-matching.js";
import { createPlanningProviders, invoiceImage, parseInvoiceResponse, parseTmapResponse, tmapRequest } from "../src/delivery-planning/planning-providers.js";
import { DEFAULT_DELIVERY_VEHICLE, planningSettingsDraftSchema, vehicleSchema, type InvoiceFields, type PlanningSettings } from "../src/delivery-planning/planning-contract.js";

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
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(fields) }] }] }) }));
    const providers = createPlanningProviders({ openai: () => "test-key", tmap: () => "test-tmap" }, fetcher);
    expect(await providers.readInvoice(Buffer.from("test"))).toEqual(fields);
    const call = fetcher.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(call[0]![1].body));
    expect(call[0]![0]).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({ store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(body.tools).toBeUndefined(); expect(body.input[0].content[0].image_url).toBe("data:image/jpeg;base64,dGVzdA==");
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
  it("rejects missing, duplicated, unknown or end-less routes", () => {
    for (const features of [[], [...tmap.features, tmap.features[1]], tmap.features.slice(0, 2), [tmap.features[0], { geometry: { type: "Point" }, properties: { index: 1, viaPointId: "unknown" } }, tmap.features[2]]]) {
      expect(() => parseTmapResponse({ ...tmap, features }, stops, "b")).toThrow();
    }
  });
  it("does not retry or expose upstream errors", async () => {
    const fetcher = vi.fn(async () => { throw new Error("SECRET_IMAGE_DATA_AND_KEY"); });
    const providers = createPlanningProviders({ openai: () => "key", tmap: () => "key" }, fetcher);
    await expect(providers.readInvoice(Buffer.from("test"))).rejects.toThrow("자동 재요청은 하지 않았습니다");
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
