import type { SalesAssignment } from "@/domain/sales";
import type { School } from "@/domain/school";

export const DISTRICT_LABELS: Record<School["district"], string> = {
  dong: "동구", jung: "중구", seo: "서구", yuseong: "유성구", daedeok: "대덕구",
};

export const ASSIGNMENT_STATUS_META = {
  before: { label: "방문 전", tone: "neutral" },
  completed: { label: "방문 완료", tone: "success" },
  followUp: { label: "후속 필요", tone: "attention" },
  revisit: { label: "재방문 필요", tone: "attention" },
  onHold: { label: "보류", tone: "info" },
} as const;

export function deliveryStatusLabel(status: SalesAssignment["brochureStatus"]) {
  return { delivered: "전달", notDelivered: "미전달", unknown: "미확인" }[status];
}

export function schoolLocationSummary(school: Pick<School, "district" | "address">) {
  const district = DISTRICT_LABELS[school.district];
  const address = school.address.road?.trim() || school.address.jibun?.trim();
  if (!address) return `${district} · 주소 미등록`;
  // The catalog is Daejeon-only. Keep other city names and the full road number.
  const compact = address.replace(/^대전(?:광역시|시)?\s+/u, "").replace(/\s+/gu, " ");
  return compact.split(" ").includes(district) ? compact : `${district} · ${compact}`;
}

export function formatCardVisitDate(value: Date | null) {
  if (!value || Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short", day: "numeric", timeZone: "Asia/Seoul",
  }).format(value);
}
