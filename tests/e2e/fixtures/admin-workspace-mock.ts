import type { AdminWorkspaceData, NeisPreview } from "../../../src/features/admin/admin-contract";

const timestamp = "2026-09-08T06:00:00.000Z";
const cycle = "2026-09";
export const adminFixtureData: AdminWorkspaceData = {
  generatedAt: timestamp, selectedCycleId: cycle,
  employees: [
    { employeeId: "FIXTURE-ADMIN", displayName: "김온누리 관리자", roleScopes: ["admin", "delivery", "sales"], exportTeam: true, status: "active", sessionVersion: 2, permissionsVersion: 3, createdAt: timestamp, updatedAt: timestamp },
    { employeeId: "FIXTURE-EMPLOYEE-VERY-LONG-IDENTIFIER-FOR-RESPONSIVE-VERIFICATION", displayName: "한가람 영업부장", roleScopes: ["delivery", "sales"], exportTeam: false, status: "active", sessionVersion: 1, permissionsVersion: 1, createdAt: timestamp, updatedAt: timestamp },
    { employeeId: "FIXTURE-INACTIVE", displayName: "김휴직 직원", roleScopes: ["delivery"], exportTeam: false, status: "disabled", sessionVersion: 3, permissionsVersion: 1, createdAt: timestamp, updatedAt: timestamp },
  ],
  schools: [
    { schoolId: "SCHOOL-ONE", name: "대전행복초등학교", district: "seo", schoolType: "elementary", roadAddress: "대전광역시 서구 행복로 101번길 120, 본관 뒤편 납품 출입문", locationStatus: "confirmed", possibleRelocation: false, schoolBaseRevision: 2 },
    { schoolId: "SCHOOL-TWO", name: "대전미래국제고등학교부설방송통신고등학교", district: "yuseong", schoolType: "high", roadAddress: "대전광역시 유성구 미래로 120번길 3", locationStatus: "needsReview", possibleRelocation: true, schoolBaseRevision: 3 },
    { schoolId: "SCHOOL-THREE", name: "대전한마음중학교", district: "daedeok", schoolType: "middle", roadAddress: null, locationStatus: "unmatched", possibleRelocation: false, schoolBaseRevision: 1 },
  ],
  cycles: [{ cycleId: cycle, status: "active", promotedProductNames: ["온누리 우리밀 건강한 한입 핫도그", "담백한 닭가슴살 큐브", "국산 채소 만두"], copiedFromCycleId: "2026-08", createdAt: timestamp }, { cycleId: "2026-08", status: "closed", promotedProductNames: [], copiedFromCycleId: null, createdAt: timestamp }],
  zones: [{ zoneId: "ZONE-ONE", name: "서구·유성구 담당", active: true }],
  activityTags: [{ tagId: "TAG-ONE", label: "담당자 상담", active: true, displayOrder: 1, updatedAt: timestamp }, { tagId: "TAG-TWO", label: "샘플 전달 후 다음 방문 일정 조율", active: true, displayOrder: 2, updatedAt: timestamp }, { tagId: "TAG-THREE", label: "견적 요청", active: false, displayOrder: 3, updatedAt: timestamp }],
  assignments: [{ schoolId: "SCHOOL-ONE", zoneId: "ZONE-ONE", primaryAssigneeId: "FIXTURE-EMPLOYEE-VERY-LONG-IDENTIFIER-FOR-RESPONSIVE-VERIFICATION", assigneeIds: ["FIXTURE-EMPLOYEE-VERY-LONG-IDENTIFIER-FOR-RESPONSIVE-VERIFICATION"], monthlyStatus: "completed", revision: 2 }, { schoolId: "SCHOOL-TWO", zoneId: null, primaryAssigneeId: "FIXTURE-ADMIN", assigneeIds: ["FIXTURE-ADMIN"], monthlyStatus: "followUp", revision: 1 }],
  settings: { minimumAppVersion: "2026.09.08", currentSalesCycleId: cycle, commonCatalogVersion: 17, maintenanceMode: false, updatedAt: timestamp },
  syncRuns: [{ runId: "SYNTHETIC-SYNC-RUN", status: "COMPLETED", sourceCount: 307, newCount: 1, changedCount: 2, missingCount: 0, appliedCount: 3, startedAt: timestamp, completedAt: timestamp }],
  kakaoReviews: [{ schoolId: "SCHOOL-TWO", schoolBaseRevision: 3, neisName: "대전미래국제고등학교부설방송통신고등학교", neisRoadAddress: "대전광역시 유성구 미래로 120번길 3", status: "needsReview", reason: "학교 이전 여부 확인이 필요합니다.", candidates: [{ candidateId: "CANDIDATE-ONE", name: "대전미래국제고등학교", roadAddress: "대전광역시 유성구 미래로 120번길 3", addressName: "대전광역시 유성구 미래동 100", latitude: 36.35, longitude: 127.38, score: 87, placeUrl: "https://map.kakao.com/" }], generatedAt: timestamp }],
  audits: [{ logId: "AUDIT-SYNTHETIC-VERY-LONG-IDENTIFIER-FOR-RESPONSIVE-VERIFICATION-20260908", eventType: "EMPLOYEE_UPDATED", actorEmployeeId: "FIXTURE-ADMIN", targetType: "employee", targetId: "FIXTURE-EMPLOYEE-VERY-LONG-IDENTIFIER-FOR-RESPONSIVE-VERIFICATION", changedFields: ["displayName", "roleScopes", "permissionsVersion"], changeReason: "현장 직원의 역할 변경을 반영하고 납품·영업 권한을 확인했습니다.", createdAt: timestamp }, { logId: "AUDIT-FAILED", eventType: "NEIS_SYNC_FAILED", actorEmployeeId: null, targetType: "syncRun", targetId: "SYNC-FAILED", changedFields: [], changeReason: "학교 목록 원천 연결이 일시적으로 지연되었습니다.", createdAt: timestamp }],
};

type FixtureControl = {
  failLoad: boolean; failPin: boolean; failPreview: boolean;
  renamedEmployeeOnLoad: { employeeId: string; displayName: string } | null;
  held: string[]; pending: string[]; calls: Record<string, unknown[]>;
  resolve: (name: string) => void;
};
const waiting = new Map<string, () => void>();
export const adminFixtureControl: FixtureControl = {
  failLoad: false, failPin: false, failPreview: false, renamedEmployeeOnLoad: null, held: [], pending: [], calls: {},
  resolve(name) { waiting.get(name)?.(); waiting.delete(name); },
};
declare global { interface Window { adminFixture: FixtureControl } }
window.adminFixture = adminFixtureControl;
async function operation(name: string, input?: unknown) {
  (adminFixtureControl.calls[name] ??= []).push(input ?? null);
  if (adminFixtureControl.held.includes(name)) {
    adminFixtureControl.pending.push(name);
    await new Promise<void>((resolve) => waiting.set(name, resolve));
    adminFixtureControl.pending = adminFixtureControl.pending.filter((item) => item !== name);
  }
}
let previews = 0;
function preview(): NeisPreview {
  const runId = `PREVIEW-${++previews}`;
  return { runId, status: "PREVIEWED", sourceCount: 307, newCount: 1, changedCount: 1, missingCount: 0, appliedCount: 0, errorCount: 0, suspiciousReasons: [], replayed: false, changes: [
    { changeId: `${runId}-NEW`, type: "NEW", schoolId: null, schoolCode: "CODE-NEW", oldData: null, newData: { name: "대전새로운초등학교" }, approved: null, applied: false },
    { changeId: `${runId}-RISK`, type: "ADDRESS_CHANGED", schoolId: "SCHOOL-TWO", schoolCode: "CODE-RISK", oldData: { name: "대전미래국제고등학교", roadAddress: "대전광역시 유성구 옛 주소" }, newData: { name: "대전미래국제고등학교", roadAddress: "대전광역시 유성구 새 주소" }, approved: null, applied: false },
  ] };
}
export function adminErrorMessage(error: unknown) { return error instanceof Error ? error.message : "검증용 요청 실패"; }
export const adminRepository = {
  async load(cycleId?: string | null) { await operation("load", cycleId); if (adminFixtureControl.failLoad) throw new Error("최신 상태를 불러오지 못했어요. 다시 시도해주세요."); return { ...adminFixtureData, employees: adminFixtureData.employees.map((employee) => employee.employeeId === adminFixtureControl.renamedEmployeeOnLoad?.employeeId ? { ...employee, displayName: adminFixtureControl.renamedEmployeeOnLoad.displayName } : employee), selectedCycleId: cycleId ?? cycle }; },
  async reservePin() { await operation("reservePin"); if (adminFixtureControl.failPin) throw new Error("PIN 생성에 실패했어요. 다시 시도해주세요."); return { reservationId: "SYNTHETIC-RESERVATION", pin: "123456", expiresAt: "2099-09-08T06:10:00.000Z" }; },
  async createEmployee(input: unknown) { await operation("createEmployee", input); return adminFixtureData.employees[1]; },
  async updateEmployee(input: unknown) { await operation("updateEmployee", input); return adminFixtureData.employees[1]; },
  async rotatePin(input: unknown) { await operation("rotatePin", input); return { employeeId: "FIXTURE", pin: "654321", sessionRevoked: true }; },
  async revokeSessions(input: unknown) { await operation("revokeSessions", input); return { employeeId: "FIXTURE", sessionVersion: 3 }; },
  async previewNeis() { await operation("previewNeis"); if (adminFixtureControl.failPreview) throw new Error("NEIS 미리보기를 불러오지 못했어요."); return preview(); },
  async applyNeis(input: unknown) { await operation("applyNeis", input); return {}; },
  async loadAudit() { await operation("loadAudit"); return adminFixtureData.audits; },
  async createCycle(input: unknown) { await operation("createCycle", input); return {}; },
  async updateCycleProducts(input: unknown) { await operation("updateCycleProducts", input); return {}; },
  async createAssignments(input: unknown) { await operation("createAssignments", input); return {}; },
  async changeAssignment(input: unknown) { await operation("changeAssignment", input); return {}; },
  async releaseAssignments(input: unknown) { await operation("releaseAssignments", input); return {}; },
  async matchKakao(input: unknown) { await operation("matchKakao", input); return {}; },
  async confirmKakao(input: unknown) { await operation("confirmKakao", input); return {}; },
  async updateSettings(input: unknown) { await operation("updateSettings", input); return {}; },
  async updateActivityTags(input: unknown) { await operation("updateActivityTags", input); return { tags: adminFixtureData.activityTags }; },
};
