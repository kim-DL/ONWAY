import { expect, it } from "vitest";
import { autoFillAllowed, labelSuggestions, supplementSpecification, type Suggestion } from "./review-model";
it("keeps net and inner contents in specification, case packs and lot expiry opt-in", () => {
  const printed = (value: string) => ({ value, quote: value });
  const items = labelSuggestions({ kind: "single", name: printed("검증 만두"), manufacturer: null, origin: null,
    netContent: printed("750g"), innerContents: printed("25g × 30개"), casePack: { count: 8, unit: "봉", quote: "1박스 8봉" },
    expiry: printed("2027-02-01") }, "사진 1");
  expect(items.find(i => i.field === "specification")?.value).toBe("750g · 25g × 30개");
  expect(items.filter(i => autoFillAllowed(i, "", false)).map(i => i.field)).toEqual(["name", "specification"]);
  expect(items.some(i => autoFillAllowed(i, "직원이 쓴 값", false) || autoFillAllowed(i, "", true))).toBe(false);
});
it("supplements a prior front-face weight with back-face contents while preserving employee edits", () => {
  const front: Suggestion = { field: "specification", value: "750g", net: "750g", source: "사진 1", evidence: "내용량 750g" };
  const back: Suggestion = { field: "specification", value: "30개입", inner: "30개입", source: "사진 2", evidence: "1봉 30개입" };
  const result = supplementSpecification([front], back);
  expect(result.value).toBe("750g · 30개입"); expect(result.replaces).toBe("750g");
  expect(autoFillAllowed(result, "750g", false)).toBe(true);
  expect(autoFillAllowed(result, "직접 입력", true)).toBe(false);
  expect(autoFillAllowed(result, "", true)).toBe(false);
});
