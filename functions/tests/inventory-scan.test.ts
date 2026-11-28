import { describe, expect, it, vi } from "vitest";
import { canonicalGtin, scanBarcodesSchema } from "../src/inventory/inventory-barcode-contract.js";
import { findFoodProducts } from "../src/inventory/inventory-food-provider.js";
import { readLabelResponse } from "../src/inventory/inventory-label-provider.js";
import { labelReadingSchema } from "../src/inventory/inventory-scan-contract.js";
import { saveInventoryProductWithManufacturerInputSchema } from "../src/inventory/inventory-manufacturer-contract.js";

const raw = (fields: object) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(fields) }] }] });
const fetchResult = (body: unknown) => vi.fn(async () => Response.json(body));
const printed = (value: string) => ({ value, quote: value });
describe("inventory scan evidence", () => {
  it.each([false, true])("declares the optional food Secret only when lookup is enabled (%s)", async enabled => {
    const declared: string[] = [];
    vi.resetModules(); vi.stubEnv("FUNCTIONS_EMULATOR", "false"); vi.stubEnv("INVENTORY_FOOD_LOOKUP_ENABLED", String(enabled));
    vi.doMock("firebase-functions/params", async () => {
      const original = await vi.importActual<typeof import("firebase-functions/params")>("firebase-functions/params");
      return { ...original, defineSecret: (name: string) => { declared.push(name); return original.defineSecret(name); } };
    });
    try {
      const { searchInventoryFoodProducts, analyzeInventoryProductLabel } = await import("../src/inventory/scan-callables.js");
      expect(declared.includes("FOODSAFETY_API_KEY")).toBe(enabled);
      expect(searchInventoryFoodProducts.__endpoint.secretEnvironmentVariables?.map(binding => binding.key) ?? []).toEqual(enabled ? ["FOODSAFETY_API_KEY"] : []);
      expect(analyzeInventoryProductLabel.__endpoint.secretEnvironmentVariables?.map(binding => binding.key)).toEqual(["OPENAI_API_KEY"]);
    } finally { vi.doUnmock("firebase-functions/params"); vi.unstubAllEnvs(); vi.resetModules(); }
  });
  it("preserves GS1 packaging identifiers and checks their digits", () => {
    expect(canonicalGtin("8801791000192")).toBe("08801791000192");
    expect(canonicalGtin("036000291452")).toBe("00036000291452");
    expect(canonicalGtin("96385074")).toBe("00000096385074");
    expect(canonicalGtin("10036000291459")).toBe("10036000291459");
    for (const value of ["00000000", "8801791000193", "8801791000192abc", "1234", "+8801791000192"]) expect(canonicalGtin(value)).toBeNull();
    const duplicate = [{ code: "8801791000192", level: "unit" }, { code: "08801791000192", level: "case" }];
    expect(scanBarcodesSchema.safeParse(duplicate).success).toBe(false);
    expect(saveInventoryProductWithManufacturerInputSchema.shape.scanBarcodes.safeParse(duplicate).success).toBe(false);
  });
  it("keeps clear printed names while rejecting unsupported fields and lot dates", () => {
    const fields = { kind: "single", name: printed("들깨수제비"), manufacturer: { value: "판매업체", quote: "판매원 판매업체" },
      netContent: { value: "750g", quote: "총 내용량 750g" }, innerContents: printed("20입"),
      casePack: { count: 8, unit: "봉", quote: "1박스 = 18봉" }, expiry: { value: "2027-02-30", quote: "소비기한 2027.02.30" } };
    const read = readLabelResponse(raw(fields));
    expect(read).toMatchObject({ name: printed("들깨수제비"), netContent: fields.netContent, manufacturer: null, expiry: null, innerContents: null, casePack: null });
    const good = readLabelResponse(raw({ ...fields, casePack: { count: 18, unit: "봉", quote: "1박스 = 18봉" },
      expiry: { value: "2027-02-17", quote: "소비기한 2027. 2. 17" } }));
    expect(good.casePack?.count).toBe(18); expect(good.expiry?.value).toBe("2027-02-17");
    expect(readLabelResponse(raw({ ...fields, expiry: { value: "2027-02-17", quote: "제조일 2027.02.17 소비기한 별도 표기" } })).expiry).toBeNull();
    for (const quote of ["소비기한 2027.02.17 / 2027.02.20", "소비기한 2027.02.17 · 소비기한 2027.02.20"]) {
      expect(readLabelResponse(raw({ ...fields, expiry: { value: "2027-02-17", quote } })).expiry).toBeNull();
    }
    expect(readLabelResponse(raw({ ...fields, expiry: { value: "2027-02-17", quote: "제조일 26.11.27 소비기한 27.2.17" } })).expiry?.value).toBe("2027-02-17");
    expect(readLabelResponse(raw({ ...fields, kind: "multiple" })).name).toBeNull();
    expect(readLabelResponse(raw({ kind: "single", name: printed("단호박 미니전") })).casePack).toBeNull();
    expect(labelReadingSchema.safeParse({ ...good, initialStock: 18 }).success).toBe(false);
  });
  it("returns only active exact GTIN matches and never converts shelf life into an expiry", async () => {
    const row = { BAR_CD: "8801791000192", END_DT: "", CLSBIZ_DT: "", PRDLST_REPORT_NO: "110", PRDLST_NM: "쌈장", BSSH_NM: "검증식품", PRDLST_DCNM: "혼합장", POG_DAYCNT: "제조일로부터 24개월" };
    const get = fetchResult({ C005: { RESULT: { CODE: "INFO-000" }, row: [row, { ...row, PRDLST_REPORT_NO: "111", END_DT: "20150202" },
      { ...row, PRDLST_REPORT_NO: "112", CLSBIZ_DT: "20250101" }, { ...row, PRDLST_REPORT_NO: "113", BAR_CD: "036000291452" }] } });
    expect(await findFoodProducts({ by: "code", value: row.BAR_CD }, "test", get)).toEqual({ status: "ok", more: false,
      items: [{ reportNo: "110", name: "쌈장", manufacturer: "검증식품", category: "혼합장" }] });
  });
  it("keeps same-name candidates separate by report, filters discontinued rows, and degrades without a key", async () => {
    const row = { PRDLST_REPORT_NO: "100", PRDLST_NM: "고기만두", BSSH_NM: "A", PRODUCTION: "아니오" };
    const get = fetchResult({ I1250: { RESULT: { CODE: "INFO-000" }, total_count: "50", row: [row, { ...row, PRDLST_REPORT_NO: "101", BSSH_NM: "B" },
      { ...row, PRDLST_REPORT_NO: "102", PRODUCTION: "예" }] } });
    const q = { by: "name", value: "고기만두" } as const;
    expect((await findFoodProducts(q, "", get)).status).toBe("unconfigured"); expect(get).not.toHaveBeenCalled();
    const result = await findFoodProducts(q, "test", get);
    expect(result.more).toBe(true); expect(result.items.map(i => i.manufacturer)).toEqual(["A", "B"]);
    expect((await findFoodProducts(q, "test", fetchResult({ RESULT: { CODE: "INFO-110" } }))).status).toBe("unconfigured");
    expect((await findFoodProducts(q, "test", fetchResult({ RESULT: { CODE: "INFO-300" } }))).status).toBe("unavailable");
  });
});
