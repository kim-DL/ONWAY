import type { SchoolSearchItem } from "../../../src/domain/catalog";
import { getKoreanInitials, normalizeSearchText } from "../../../src/features/search/search-normalizer";

export const items: SchoolSearchItem[] = ["대전예시초등학교", "대전예시교육대학교부설중학교", "예시고등학교"].map((name, index) => ({
  schoolId: `SCHOOL-PREVIEW-${index}`, name, shortName: null, normalizedName: normalizeSearchText(name),
  initials: getKoreanInitials(name), aliases: [], schoolType: (["elementary", "middle", "high"] as const)[index]!,
  district: "seo", addressSummary: "대전광역시 서구 예시로 120 급식동 후문", operationalStatus: "active",
  photoCount: index, fieldInfoAvailable: index !== 1,
}));
export const catalog = { version: 1, catalogNamespace: "school-preview", items };
