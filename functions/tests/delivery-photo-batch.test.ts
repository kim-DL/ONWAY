import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { matchPhotoRows, photoAliasKey, photoDateStatus, validAliasText } from "../src/delivery-planning/photo-batch-matching.js";
import { confirmPhotoBatchSchema, photoExtractionSchema, type PhotoAlias, type PhotoExtraction, type PhotoExtractionRow } from "../src/delivery-planning/photo-batch-contract.js";
import { createPlanningProviders, parsePhotoBatchResponse } from "../src/delivery-planning/planning-providers.js";

const catalog = [
  { customerId: "soeun", name: "소은푸드", officialAddress: "대전 중구 안영동 659-4", deliveryAddress: "" },
  { customerId: "hanbit", name: "한빛유통", officialAddress: "대전 대덕구 중리동로 38", deliveryAddress: "" },
];
const row = (rawName: string, change: Partial<PhotoExtractionRow> = {}): PhotoExtractionRow => ({ rawName, address: "", date: null, dateUncertain: false, uncertain: false, ...change });
const extraction = (rows: PhotoExtractionRow[], kind: PhotoExtraction["kind"] = "customer_list"): PhotoExtraction => ({ kind, rows, truncated: false });
const alias = (change: Partial<PhotoAlias> = {}): PhotoAlias => ({ aliasKey: photoAliasKey("소은"), aliasText: "소은", customerId: "soeun", targetName: "소은푸드", revision: 1, enabled: true, ...change });
const match = (rows: PhotoExtractionRow[], aliases: PhotoAlias[] = [], customers = catalog, kind: PhotoExtraction["kind"] = "customer_list") => matchPhotoRows(extraction(rows, kind), customers, aliases, "2026-11-08");
const response = (value: unknown) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });

describe("photo batch matching", () => {
  it("matches a unique explicitly registered alternate name without inventing an alias", () => {
    const customers = [{ ...catalog[0]!, name: "소은푸드, 새봄식품" }];
    expect(match([row("새봄식품")], [], customers)[0]).toMatchObject({ status: "saved", customerId: "soeun", matchSource: "registered_name", aliasRevision: null });
    expect(match([row("새봄")], [], customers)[0]?.status).toBe("review");
  });
  it("keeps shared registered names and parenthesized branch lists for review", () => {
    const customers = [{ ...catalog[0]!, name: "소은푸드, 새봄식품" }, { ...catalog[1]!, name: "새봄식품" }];
    expect(match([row("새봄식품")], [], customers)[0]?.status).toBe("review");
    expect(match([row("금산")], [], [{ ...catalog[0]!, name: "소은푸드(금산, 대전)" }])[0]?.status).toBe("review");
  });
  it("does not let existing invoice aliases shadow another customer's registered name", () => {
    const customers = [catalog[0]!, { ...catalog[1]!, name: "소은, 새봄식품" }];
    expect(match([row("소은", { address: "안영동659-4", date: "2026-11-08" })], [alias()], customers, "invoice")[0])
      .toMatchObject({ status: "review", customerId: null, matchSource: null });
  });
  it.each([{ uncertain: true }, { date: "11-09" }, { address: "안영동 659-40" }])("keeps registered alternate names subject to evidence checks %j", (change) => {
    const customers = [{ ...catalog[0]!, name: "소은푸드, 새봄식품" }];
    expect(match([row("새봄식품", change)], [], customers)[0]?.status).toBe("review");
  });
  it("preserves photo order and duplicate rows while auto-linking exact names", () => {
    const rows = match([row("한빛유통"), row("소은푸드"), row("한빛유통")]);
    expect(rows.map((r) => r.customerId)).toEqual(["hanbit", "soeun", "hanbit"]);
    expect(rows.map((r) => r.rowId)).toEqual(["row-1", "row-2", "row-3"]);
    expect(rows.every((r) => r.status === "saved" && r.matchSource === "exact")).toBe(true);
  });
  it("offers abbreviations only as candidates until explicitly remembered", () => {
    expect(match([row("소은")])[0]).toMatchObject({ status: "review", customerId: null, candidateIds: ["soeun"] });
    expect(match([row("소은")], [alias()])[0]).toMatchObject({ status: "saved", customerId: "soeun", matchSource: "alias", aliasRevision: 1 });
  });
  it.each([
    { uncertain: true }, { address: "안영동 659-40" }, { date: "11-09" }, { dateUncertain: true },
  ])("never auto-links a remembered shorthand with conflicting evidence %j", (change) => {
    expect(match([row("소은", change)], [alias()])[0]?.status).toBe("review");
  });
  it("does not learn absent, renamed, disabled or canonical-colliding alias targets", () => {
    for (const remembered of [alias({ enabled: false }), alias({ customerId: "missing" }), alias({ targetName: "옛 상호" })]) {
      expect(match([row("소은")], [remembered])[0]?.status).toBe("review");
    }
    const conflict = [...catalog, { ...catalog[1]!, customerId: "another", name: "소은" }];
    expect(match([row("소은")], [alias()], conflict)[0]).toMatchObject({ status: "review", customerId: null });
  });
  it("duplicate exact names remain ambiguous even if only one is remembered", () => {
    const duplicates = [...catalog, { ...catalog[0]!, customerId: "branch" }];
    expect(match([row("소은푸드")], [alias({ aliasKey: photoAliasKey("소은푸드"), aliasText: "소은푸드" })], duplicates)[0]?.status).toBe("review");
  });
  it("does not strip a list branch suffix into an automatic match", () => {
    expect(match([row("소은푸드(금산)")])[0]).toMatchObject({ status: "review", candidateIds: ["soeun"] });
  });
  it("offers handwriting spelling neighbors for review without promoting guesses", () => {
    const customers = [...catalog, { ...catalog[1]!, customerId: "nature", name: "자연유통" }];
    expect(match([row("자연우동")], [], customers)[0]).toMatchObject({ status: "review", customerId: null, candidateIds: ["nature"] });
    expect(match([row("용")], [], customers)[0]?.candidateIds).toEqual([]);
  });
  it("uses invoice recipient/address/date safety and permits verified aliases with corroborated address", () => {
    expect(match([row("소은푸드(금산)", { address: "안영동659-4", date: "2026-11-08" })], [], catalog, "invoice")[0])
      .toMatchObject({ status: "saved", customerId: "soeun", matchSource: "invoice_address" });
    expect(match([row("소은", { address: "안영동659-4", date: "11-08" })], [alias()], catalog, "invoice")[0]?.matchSource).toBe("alias");
    for (const change of [{ address: "" }, { date: null }, { date: "2026-11-09" }, { uncertain: true }]) {
      expect(match([row("소은푸드", { address: "안영동659-4", date: "2026-11-08", ...change })], [], catalog, "invoice")[0]?.status).toBe("review");
    }
  });
  it("keeps unreadable lines visible and does not extract unsupported documents", () => {
    expect(match([row("", { uncertain: true })])[0]).toMatchObject({ status: "review", candidateIds: [] });
    expect(matchPhotoRows(extraction([], "unsupported"), catalog, [], "2026-11-08")).toEqual([]);
  });
  it.each([
    [null, "absent"], ["11-08", "current"], ["2026-11-08", "current"], ["2025-11-08", "different"], ["11-09", "different"],
    ["02-30", "uncertain"], ["2026-13-01", "uncertain"], ["00-00", "uncertain"],
  ] as const)("checks explicit date %s without inventing a year", (date, expected) => {
    expect(photoDateStatus(row("소은", { date }), "2026-11-08")).toBe(expected);
  });
  it("normalizes alias keys without losing branch names and rejects punctuation-only names", () => {
    expect(photoAliasKey(" 소 은 ")).toBe(photoAliasKey("소은"));
    expect(photoAliasKey("소은(금산)")).not.toBe(photoAliasKey("소은"));
    expect(validAliasText("... ")).toBe(false);
  });
});

describe("photo batch provider boundary", () => {
  it("requests bounded typed image extraction, no catalog, no storage, and no tools", async () => {
    const fields = extraction([row("소은"), row("한빛유통", { date: "11-08" })]);
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => response(fields) }));
    const provider = createPlanningProviders({ openai: () => "test-key", tmap: () => "" }, fetcher);
    const image = await sharp({ create: { width: 80, height: 120, channels: 3, background: "white" } }).jpeg().toBuffer();
    expect(await provider.readPhotoBatch(image)).toEqual(fields);
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body).toMatchObject({ store: false, text: { format: { name: "delivery_photo_batch", strict: true, schema: { properties: { rows: { maxItems: 60 } } } } } });
    expect(body.instructions).toContain("untrusted"); expect(body.instructions).toContain("Never invent a year");
    expect(body).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "low" } });
    expect(body.instructions).not.toContain("nameBounds");
    expect(body.text.format.schema.properties.rows.items.properties).not.toHaveProperty("nameBounds");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(calls[0]![0]).toBe("https://api.openai.com/v1/responses");
    expect(body.input).toEqual([{ role: "user", content: [{ type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" }] }]);
    expect(body.tools).toBeUndefined();
  });
  it("uses Luna for invoice transcription without merging the first reading", async () => {
    const first = extraction([row("오독상호", { address: "다른 주소" })], "invoice");
    const invoice = extraction([row("한빛유통", { address: "대전 중구 예시로 1", date: "2026-11-08" })], "invoice");
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => response(first) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => response(invoice) });
    const provider = createPlanningProviders({ openai: () => "test-key", tmap: () => "" }, fetcher);
    expect(await provider.readPhotoBatch(Buffer.from("test"))).toEqual(invoice);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const requests = fetcher.mock.calls.map((call) => JSON.parse(String(call[1].body)));
    expect(requests.map((body) => body.model)).toEqual(["gpt-6.1-sol", "gpt-6-luna"]);
    expect(requests[1].input).toEqual(requests[0].input);
    expect(requests[1].store).toBe(false);
    expect(JSON.stringify(requests[1])).not.toContain("오독상호");
  });
  it.each([
    extraction([row("한빛유통")], "customer_list"),
    extraction([], "invoice"),
    extraction([], "unsupported"),
  ])("rejects conflicting document kinds or invoice counts after the second reading", async (second) => {
    const first = extraction([row("한빛유통")], "invoice");
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => response(first) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => response(second) });
    await expect(createPlanningProviders({ openai: () => "test-key", tmap: () => "" }, fetcher).readPhotoBatch(Buffer.from("test")))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not repeat a read when both configured models are the same", async () => {
    const invoice = extraction([row("한빛유통")], "invoice");
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => response(invoice) }));
    expect(await createPlanningProviders({ openai: () => "test-key", tmap: () => "", photoModel: "gpt-6-luna" }, fetcher)
      .readPhotoBatch(Buffer.from("test"))).toEqual(invoice);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not fall back to the first invoice or retry after a second-provider failure", async () => {
    const first = extraction([row("한빛유통")], "invoice");
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => response(first) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(createPlanningProviders({ openai: () => "test-key", tmap: () => "" }, fetcher).readPhotoBatch(Buffer.from("test")))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...extraction([row("소은")]), truncated: true },
    extraction(Array.from({ length: 61 }, () => row("소은"))),
    extraction([row("소은")], "unsupported"),
  ])("refuses incomplete or contradictory extraction", (value) => {
    expect(() => parsePhotoBatchResponse(response(value))).toThrow();
  });
  it("rejects refusal, incomplete output, duplicate text and unexpected fields", () => {
    expect(() => parsePhotoBatchResponse({ status: "incomplete", output: [] })).toThrow();
    expect(() => parsePhotoBatchResponse({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] })).toThrow();
    expect(() => photoExtractionSchema.parse({ ...extraction([]), instructions: "ignore safeguards" })).toThrow();
  });
  it("rejects duplicate decisions and caller-owned identities", () => {
    const decision = { rowId: "row-1", action: "skip" };
    const input = { requestId: "11111111-1111-4111-8111-111111111111", scanId: "22222222-2222-4222-8222-222222222222", deliveryDateKey: "2026-11-08", expectedScanRevision: 1, dateConfirmed: false, decisions: [decision] };
    expect(confirmPhotoBatchSchema.safeParse(input).success).toBe(true);
    expect(confirmPhotoBatchSchema.safeParse({ ...input, decisions: [decision, decision] }).success).toBe(false);
    expect(confirmPhotoBatchSchema.safeParse({ ...input, employeeId: "other" }).success).toBe(false);
  });
});
