import { describe, expect, it } from "vitest";
import { buildSalesDistrictOptions, districtIndexForKey } from "./sales-district-filter-model";

describe("sales district filter model", () => {
  it("counts the full scoped set in existing district order, without duplicate schools", () => {
    expect(buildSalesDistrictOptions([
      { schoolId: "a", district: "seo" }, { schoolId: "b", district: "jung" },
      { schoolId: "c", district: "seo" }, { schoolId: "a", district: "seo" },
      { schoolId: "d", district: "daedeok" },
    ], "jung")).toEqual([
      { value: "all", label: "전체 지역", count: 4 },
      { value: "seo", label: "서구", count: 2 },
      { value: "jung", label: "중구", count: 1 },
      { value: "daedeok", label: "대덕구", count: 1 },
    ]);
  });

  it("retains the active region with zero results after a live assignment removal", () => {
    expect(buildSalesDistrictOptions([{ schoolId: "a", district: "seo" }], "jung")).toEqual([
      { value: "all", label: "전체 지역", count: 1 },
      { value: "seo", label: "서구", count: 1 },
      { value: "jung", label: "중구", count: 0 },
    ]);
    expect(buildSalesDistrictOptions([], "all")).toEqual([{ value: "all", label: "전체 지역", count: 0 }]);
    expect(buildSalesDistrictOptions([], "dong")).toEqual([
      { value: "all", label: "전체 지역", count: 0 }, { value: "dong", label: "동구", count: 0 },
    ]);
  });

  it("uses roving radio navigation with wrapping and Home/End", () => {
    expect(districtIndexForKey("ArrowRight", 5, 6)).toBe(0);
    expect(districtIndexForKey("ArrowDown", 2, 6)).toBe(3);
    expect(districtIndexForKey("ArrowLeft", 0, 6)).toBe(5);
    expect(districtIndexForKey("ArrowUp", 2, 6)).toBe(1);
    expect(districtIndexForKey("Home", 4, 6)).toBe(0);
    expect(districtIndexForKey("End", 0, 6)).toBe(5);
    expect(districtIndexForKey("Tab", 2, 6)).toBeNull();
    expect(districtIndexForKey(" ", 2, 6)).toBeNull();
    expect(districtIndexForKey("ArrowRight", 0, 0)).toBeNull();
  });
});
