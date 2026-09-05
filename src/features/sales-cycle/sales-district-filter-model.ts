import type { School } from "@/domain/school";
import { DISTRICT_LABELS } from "./sales-school-card-presentation";

export type SalesDistrict = School["district"] | "all";
export type SalesDistrictOption = { value: SalesDistrict; label: string; count: number };

export function buildSalesDistrictOptions(
  schools: readonly Pick<School, "schoolId" | "district">[],
  selected: SalesDistrict = "all",
): SalesDistrictOption[] {
  const counts = new Map<School["district"], number>();
  const seen = new Set<string>();
  for (const school of schools) {
    if (seen.has(school.schoolId)) continue;
    seen.add(school.schoolId);
    counts.set(school.district, (counts.get(school.district) ?? 0) + 1);
  }
  // A live assignment removal must not leave an invisible, active filter behind.
  if (selected !== "all" && !counts.has(selected)) counts.set(selected, 0);
  return [
    { value: "all", label: "전체 지역", count: seen.size },
    ...Array.from(counts, ([value, count]) => ({ value, label: DISTRICT_LABELS[value], count })),
  ];
}

export function districtIndexForKey(key: string, index: number, count: number): number | null {
  if (count < 1) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index + count - 1) % count;
  return null;
}
