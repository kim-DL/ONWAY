import type { AdminRole, AdminSchool } from "./admin-contract";

export const ROLE_LABELS: Record<AdminRole, string> = {
  delivery: "학교납품",
  sales: "영업/홍보",
  viewer: "조회",
  admin: "관리자",
};

export const DISTRICT_LABELS: Record<string, string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

export const SCHOOL_TYPE_LABELS: Record<string, string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타",
};

export const CHANGE_LABELS: Record<string, string> = {
  NEW: "신규",
  NAME_CHANGED: "교명 변경",
  ADDRESS_CHANGED: "주소 변경",
  PHONE_CHANGED: "전화 변경",
  HOMEPAGE_CHANGED: "홈페이지 변경",
  TYPE_CHANGED: "학교급 변경",
  MISSING: "원천 누락",
};

export const MONTHLY_STATUS_LABELS: Record<string, string> = {
  before: "방문 전",
  completed: "방문 완료",
  followUp: "후속 필요",
  revisit: "재방문",
  onHold: "보류",
};

export const CYCLE_STATUS_LABELS: Record<string, string> = {
  draft: "준비 중",
  active: "운영 중",
  closed: "종료",
};

export const SYNC_STATUS_LABELS: Record<string, string> = {
  PREVIEWED: "미리보기 완료",
  APPLYING: "적용 중",
  COMPLETED: "적용 완료",
  FAILED: "실패",
  SUSPICIOUS_RESULT: "안전 검토 필요",
};

export const KAKAO_STATUS_LABELS: Record<string, string> = {
  unmatched: "후보 조회 필요",
  autoMatched: "자동 확인",
  needsReview: "관리자 검토 필요",
  confirmed: "관리자 확정",
  failed: "후보 없음",
};

export const AUDIT_EVENT_LABELS: Record<string, string> = {
  INVENTORY_PRODUCT_CREATED: "재고 품목 등록",
  INVENTORY_PRODUCT_UPDATED: "재고 품목 정보 수정",
  INVENTORY_PRODUCT_STATUS_CHANGED: "재고 품목 활성 상태 변경",
  INVENTORY_PRODUCT_DELETED: "재고 품목 삭제",
  INVENTORY_RECEIVE: "재고 입고",
  INVENTORY_ISSUE: "재고 출고",
  INVENTORY_ADJUST: "재고 수량 조정",
  INVENTORY_COUNT_MATCH: "재고 수량 일치 확인",
  INVENTORY_COUNT_ADJUST: "재고 실사 수량 수정",
  INVENTORY_LOT_UPDATE: "재고 유통기한 수정",
  INVENTORY_SETTINGS_UPDATED: "재고조사 설정 변경",
  CUSTOMER_CREATED: "거래처 등록",
  CUSTOMER_UPDATED: "거래처 정보 변경",
  ADMIN_SESSION_ACTIVATED: "관리자 세션 승인",
  APP_SETTINGS_UPDATED: "앱 운영 설정 변경",
  ACTIVITY_TAGS_UPDATED: "영업 활동 태그 변경",
  EMPLOYEE_CREATED: "직원 등록",
  EMPLOYEE_PIN_ROTATED: "직원 PIN 재발급",
  EMPLOYEE_SESSIONS_REVOKED: "직원 세션 종료",
  EMPLOYEE_UPDATED: "직원 정보 변경",
  CSV_EXPORTED: "CSV 내보내기",
  SCHOOL_FIELD_PROFILE_UPDATED: "학교 현장정보 변경",
  PHOTO_ADDED: "현장 사진 추가",
  PHOTO_REPLACED: "현장 사진 교체",
  PHOTO_DELETED: "현장 사진 삭제",
  PHOTO_RESTORED: "현장 사진 복원",
  SALES_ASSIGNMENT_CHANGED: "영업 배정 변경",
  SALES_ASSIGNMENTS_CREATED: "영업 배정 생성",
  SALES_ASSIGNMENTS_RELEASED: "영업 배정 제외",
  SALES_ASSIGNMENTS_CLAIMED: "담당자 학교 가져오기",
  SALES_CYCLE_CREATED: "영업 Cycle 생성",
  SALES_CYCLE_PRODUCTS_UPDATED: "월별 홍보 제품 변경",
  SALES_PROFILE_UPDATED: "영업 상태 변경",
  SALES_VISIT_RECORDED: "방문 기록 등록",
  NEIS_SYNC_STARTED: "NEIS 동기화 시작",
  NEIS_SYNC_COMPLETED: "NEIS 동기화 완료",
  NEIS_SYNC_FAILED: "NEIS 동기화 실패",
  KAKAO_AUTO_MATCHED: "Kakao 위치 자동 확인",
  KAKAO_MATCH_REVIEW_REQUIRED: "Kakao 위치 검토 요청",
  KAKAO_MATCH_FAILED: "Kakao 위치 매칭 실패",
  KAKAO_MATCH_CONFIRMED: "Kakao 위치 확정",
  KAKAO_MATCH_CHANGED: "Kakao 확정 위치 변경",
};

export function auditEventLabel(eventType: string) {
  return AUDIT_EVENT_LABELS[eventType] ?? eventType;
}

export function initials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("");
}

export function formatDate(value: string | null, includeTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function currentCycleId() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function cycleDisplayLabel(cycleId: string) {
  const [year, month] = cycleId.split("-");
  return `${year}년 ${Number(month)}월`;
}

export function suggestedCycleId(cycles: readonly { cycleId: string }[]) {
  const current = currentCycleId();
  if (!cycles.some((cycle) => cycle.cycleId === current)) return current;
  const [year, month] = current.split("-").map(Number);
  const next = new Date(year!, month!, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function schoolNeedsReview(school: AdminSchool) {
  return school.possibleRelocation ||
    (school.locationStatus !== "confirmed" && school.locationStatus !== "autoMatched");
}
