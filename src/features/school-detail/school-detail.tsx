"use client";

import { useCallback, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import dynamic from "next/dynamic";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FloatingContextBar } from "@/components/ui/floating-context-bar";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type {
  School,
  SchoolFieldProfile,
  SchoolFieldProfilePatch,
} from "@/domain/school";
import type { SalesVisit } from "@/domain/sales";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { WorkMode } from "@/features/app-shell/shell-policy";
import {
  INTEREST_META,
  interestHearts,
} from "@/features/sales-visit/heart-interest-selector";
import type { RecordedVisitSummary } from "@/features/sales-visit/sales-visit-sheet";
import { APP_METADATA } from "@/lib/app-metadata";
import { schoolDetailRepository } from "./school-detail-repository";
import { buildKakaoDirectionsUrl } from "./kakao-directions";
import { useSchoolDetail } from "./use-school-detail";

const SchoolPhotoGallery = dynamic(
  () => import("./school-photo-gallery").then((module) => module.SchoolPhotoGallery),
  {
    loading: () => (
      <section className="school-photo-gallery school-photo-gallery--loading" role="status" aria-label="현장 사진 준비 중">
        <div><span className="search-pulse" aria-hidden="true" /><strong>저장된 현장 사진을 준비하고 있어요.</strong></div>
      </section>
    ),
  },
);

const SalesCollaboration = dynamic(
  () => import("@/features/sales-history/sales-collaboration").then((module) => module.SalesCollaboration),
  { loading: () => <div className="sales-deferred-loading" role="status">협업 정보를 준비하고 있습니다.</div> },
);

const SalesHistoryTimeline = dynamic(
  () => import("@/features/sales-history/sales-history-timeline").then((module) => module.SalesHistoryTimeline),
  { loading: () => <div className="sales-deferred-loading" role="status">방문 이력을 준비하고 있습니다.</div> },
);

const SalesVisitSheet = dynamic(
  () => import("@/features/sales-visit/sales-visit-sheet").then((module) => module.SalesVisitSheet),
  {
    loading: () => (
      <BottomSheet open title="방문 기록 준비 중" description="입력 화면을 안전하게 불러오고 있습니다." onClose={() => undefined}>
        <div className="sales-deferred-loading" role="status">잠시만 기다려주세요.</div>
      </BottomSheet>
    ),
  },
);

const DISTRICT_LABELS: Record<School["district"], string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

const SCHOOL_TYPE_LABELS: Record<School["schoolType"], string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타",
};

const EMPTY_PROFILE = {
  contacts: { dietitianPhone: null, cafeteriaPhone: null },
  cafeteria: {
    building: null,
    floor: null,
    locationDescription: null,
    entranceDescription: null,
    routeDescription: null,
  },
  inspection: { startTime: null, endTime: null, note: null },
  equipment: { cartRequired: "unknown", elevator: "unknown", stairsRequired: "unknown" },
  vehicle: { access: "unknown", unloadingLocation: null, parking: "unknown", note: null },
  fieldNotes: null,
} as const satisfies Pick<
  SchoolFieldProfile,
  "contacts" | "cafeteria" | "inspection" | "equipment" | "vehicle" | "fieldNotes"
>;

type EditorSection = "all" | "contacts" | "cafeteria" | "inspection" | "equipment" | "vehicle" | "fieldNotes";

const EDITOR_TITLES: Record<EditorSection, string> = {
  all: "현장정보 한 번에 입력",
  contacts: "학교 연락처 수정",
  cafeteria: "급식실 위치 수정",
  inspection: "검수시간 수정",
  equipment: "이동 장비 수정",
  vehicle: "차량·하역 수정",
  fieldNotes: "현장 특이사항 수정",
};

function text(value: string | null) {
  return value ?? "";
}

function nullable(value: string) {
  return value.length > 0 ? value : null;
}

function phoneHref(value: string) {
  return `tel:${value.replace(/(?!^)\+|[^\d+]/gu, "")}`;
}

function requirementLabel(value: SchoolFieldProfile["equipment"]["cartRequired"]) {
  return ({ required: "필요", notRequired: "불필요", unknown: "확인 안 됨" })[value];
}

function availabilityLabel(value: SchoolFieldProfile["equipment"]["elevator"]) {
  return ({ available: "있음", unavailable: "없음", unknown: "확인 안 됨" })[value];
}

function accessLabel(value: SchoolFieldProfile["vehicle"]["access"]) {
  return ({ available: "가능", limited: "제한적", unavailable: "불가", unknown: "확인 안 됨" })[value];
}

function display(value: string | null) {
  return value ?? "확인 안 됨";
}

function profileSection(profile: SchoolFieldProfile | null, section: EditorSection) {
  const source = profile ?? EMPTY_PROFILE;
  if (section === "all") {
    return {
      contacts: { ...source.contacts },
      cafeteria: { ...source.cafeteria },
      inspection: { ...source.inspection },
      equipment: { ...source.equipment },
      vehicle: { ...source.vehicle },
      fieldNotes: source.fieldNotes,
    } satisfies SchoolFieldProfilePatch;
  }
  if (section === "fieldNotes") return { fieldNotes: source.fieldNotes };
  return { [section]: source[section] } as SchoolFieldProfilePatch;
}

function FieldProfileEditor({
  section,
  profile,
  saving,
  onSave,
}: {
  section: EditorSection;
  profile: SchoolFieldProfile | null;
  saving: boolean;
  onSave: (patch: SchoolFieldProfilePatch) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SchoolFieldProfilePatch>(() => profileSection(profile, section));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(draft);
  };

  return (
    <form className="field-editor" data-full={section === "all"} onSubmit={submit}>
      {(section === "all" || section === "contacts") && draft.contacts ? (
        <div className="field-form-grid field-form-grid--contacts">
          {section === "all" ? <div className="field-editor-section-title"><span>01</span><div><strong>학교 연락처</strong><small>영양사 선생님과 급식실에 바로 연결되는 번호</small></div></div> : null}
          <label><span>영양사 선생님 전화</span><input type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={text(draft.contacts.dietitianPhone)} onChange={(event) => setDraft({ ...draft, contacts: { ...draft.contacts!, dietitianPhone: nullable(event.target.value) } })} placeholder="예: 010-1234-5678" /></label>
          <label><span>급식실 전화</span><input type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={text(draft.contacts.cafeteriaPhone)} onChange={(event) => setDraft({ ...draft, contacts: { ...draft.contacts!, cafeteriaPhone: nullable(event.target.value) } })} placeholder="예: 042-123-4567" /></label>
        </div>
      ) : null}

      {(section === "all" || section === "cafeteria") && draft.cafeteria ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><span>02</span><div><strong>급식실과 동선</strong><small>도착 후 바로 찾아갈 수 있는 위치 정보</small></div></div> : null}
          <label><span>건물</span><input value={text(draft.cafeteria.building)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, building: nullable(event.target.value) } })} placeholder="예: 본관" /></label>
          <label><span>층</span><input value={text(draft.cafeteria.floor)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, floor: nullable(event.target.value) } })} placeholder="예: 1층" /></label>
          <label className="field-form-grid__wide"><span>급식실 위치</span><textarea value={text(draft.cafeteria.locationDescription)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, locationDescription: nullable(event.target.value) } })} placeholder="정문에서 급식실까지 위치를 적어주세요." /></label>
          <label className="field-form-grid__wide"><span>출입구</span><textarea value={text(draft.cafeteria.entranceDescription)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, entranceDescription: nullable(event.target.value) } })} placeholder="사용할 출입구를 적어주세요." /></label>
          <label className="field-form-grid__wide"><span>이동 동선</span><textarea value={text(draft.cafeteria.routeDescription)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, routeDescription: nullable(event.target.value) } })} placeholder="현장에서 빠르게 따라갈 수 있게 적어주세요." /></label>
        </div>
      ) : null}

      {(section === "all" || section === "inspection") && draft.inspection ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><span>03</span><div><strong>검수시간</strong><small>납품 일정과 혼잡 시간 안내</small></div></div> : null}
          <label><span>검수 시작</span><input type="time" value={text(draft.inspection.startTime)} onChange={(event) => setDraft({ ...draft, inspection: { ...draft.inspection!, startTime: nullable(event.target.value) } })} /></label>
          <label><span>검수 종료</span><input type="time" value={text(draft.inspection.endTime)} onChange={(event) => setDraft({ ...draft, inspection: { ...draft.inspection!, endTime: nullable(event.target.value) } })} /></label>
          <label className="field-form-grid__wide"><span>추가 설명</span><textarea value={text(draft.inspection.note)} onChange={(event) => setDraft({ ...draft, inspection: { ...draft.inspection!, note: nullable(event.target.value) } })} placeholder="혼잡 시간이나 주의사항을 적어주세요." /></label>
        </div>
      ) : null}

      {(section === "all" || section === "equipment") && draft.equipment ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><span>04</span><div><strong>이동 장비</strong><small>대차·엘리베이터·계단 사용 여부</small></div></div> : null}
          <label><span>대차 필요</span><select value={draft.equipment.cartRequired} onChange={(event) => setDraft({ ...draft, equipment: { ...draft.equipment!, cartRequired: event.target.value as SchoolFieldProfile["equipment"]["cartRequired"] } })}><option value="required">필요</option><option value="notRequired">불필요</option><option value="unknown">확인 안 됨</option></select></label>
          <label><span>엘리베이터</span><select value={draft.equipment.elevator} onChange={(event) => setDraft({ ...draft, equipment: { ...draft.equipment!, elevator: event.target.value as SchoolFieldProfile["equipment"]["elevator"] } })}><option value="available">있음</option><option value="unavailable">없음</option><option value="unknown">확인 안 됨</option></select></label>
          <label className="field-form-grid__wide"><span>계단 이동</span><select value={draft.equipment.stairsRequired} onChange={(event) => setDraft({ ...draft, equipment: { ...draft.equipment!, stairsRequired: event.target.value as SchoolFieldProfile["equipment"]["stairsRequired"] } })}><option value="required">필요</option><option value="notRequired">불필요</option><option value="unknown">확인 안 됨</option></select></label>
        </div>
      ) : null}

      {(section === "all" || section === "vehicle") && draft.vehicle ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><span>05</span><div><strong>차량과 하역</strong><small>진입·주차·하역 지점 정보</small></div></div> : null}
          <label><span>차량 진입</span><select value={draft.vehicle.access} onChange={(event) => setDraft({ ...draft, vehicle: { ...draft.vehicle!, access: event.target.value as SchoolFieldProfile["vehicle"]["access"] } })}><option value="available">가능</option><option value="limited">제한적</option><option value="unavailable">불가</option><option value="unknown">확인 안 됨</option></select></label>
          <label><span>주차</span><select value={draft.vehicle.parking} onChange={(event) => setDraft({ ...draft, vehicle: { ...draft.vehicle!, parking: event.target.value as SchoolFieldProfile["vehicle"]["parking"] } })}><option value="available">가능</option><option value="limited">제한적</option><option value="unavailable">불가</option><option value="unknown">확인 안 됨</option></select></label>
          <label className="field-form-grid__wide"><span>하역 위치</span><textarea value={text(draft.vehicle.unloadingLocation)} onChange={(event) => setDraft({ ...draft, vehicle: { ...draft.vehicle!, unloadingLocation: nullable(event.target.value) } })} placeholder="차량을 세우고 하역할 위치를 적어주세요." /></label>
          <label className="field-form-grid__wide"><span>차량 참고</span><textarea value={text(draft.vehicle.note)} onChange={(event) => setDraft({ ...draft, vehicle: { ...draft.vehicle!, note: nullable(event.target.value) } })} placeholder="진입 시간이나 회차 주의사항을 적어주세요." /></label>
        </div>
      ) : null}

      {section === "all" || section === "fieldNotes" ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><span>06</span><div><strong>공동 현장 메모</strong><small>다음 직원에게 꼭 필요한 주의사항</small></div></div> : null}
          <label className="field-form-grid__wide"><span>현장 특이사항</span><textarea value={text(draft.fieldNotes ?? null)} onChange={(event) => setDraft({ ...draft, fieldNotes: nullable(event.target.value) })} placeholder="다음 직원이 꼭 알아야 할 내용을 적어주세요." /></label>
        </div>
      ) : null}

      <div className="field-editor__actions">
        <GlassButton variant="primary" type="submit" disabled={saving}>{saving ? "저장 중…" : "변경사항 저장"}</GlassButton>
      </div>
    </form>
  );
}

function FieldInfoContent({
  profile,
  onEdit,
  canEdit,
}: {
  profile: SchoolFieldProfile;
  onEdit: (section: EditorSection) => void;
  canEdit: boolean;
}) {
  const location = [profile.cafeteria.building, profile.cafeteria.floor, profile.cafeteria.locationDescription]
    .filter(Boolean)
    .join(" · ");
  const inspection = profile.inspection.startTime && profile.inspection.endTime
    ? `${profile.inspection.startTime} ~ ${profile.inspection.endTime}`
    : profile.inspection.startTime ?? profile.inspection.endTime ?? "확인 안 됨";

  return (
    <>
      <section className="field-priority" aria-label="현장 핵심 요약">
        <div><span><Icon name="clock" />검수시간</span><strong>{inspection}</strong><small>{profile.inspection.note ?? "추가 안내 없음"}</small></div>
        <div><span><Icon name="clipboard" />대차</span><strong>{requirementLabel(profile.equipment.cartRequired)}</strong><small>계단 이동 {requirementLabel(profile.equipment.stairsRequired)}</small></div>
        <div><span><Icon name="building" />엘리베이터</span><strong>{availabilityLabel(profile.equipment.elevator)}</strong><small>공동 현장정보</small></div>
        <div><span><Icon name="location" />급식실</span><strong>{location || "확인 안 됨"}</strong><small>{profile.cafeteria.entranceDescription ?? "출입구 확인 필요"}</small></div>
      </section>

      <div className="field-section-grid">
        <SoftCard className="field-section">
          <div className="field-section__heading"><div><span>01 · LOCATION</span><h2>급식실과 동선</h2></div>{canEdit ? <button type="button" onClick={() => onEdit("cafeteria")}>수정</button> : null}</div>
          <dl><div><dt>출입구</dt><dd>{display(profile.cafeteria.entranceDescription)}</dd></div><div><dt>이동 동선</dt><dd>{display(profile.cafeteria.routeDescription)}</dd></div></dl>
        </SoftCard>
        <SoftCard className="field-section">
          <div className="field-section__heading"><div><span>02 · EQUIPMENT</span><h2>계단과 엘리베이터</h2></div>{canEdit ? <button type="button" onClick={() => onEdit("equipment")}>수정</button> : null}</div>
          <dl><div><dt>엘리베이터</dt><dd>{availabilityLabel(profile.equipment.elevator)}</dd></div><div><dt>계단 이동</dt><dd>{requirementLabel(profile.equipment.stairsRequired)}</dd></div></dl>
        </SoftCard>
        <SoftCard className="field-section">
          <div className="field-section__heading"><div><span>03 · VEHICLE</span><h2>차량과 하역</h2></div>{canEdit ? <button type="button" onClick={() => onEdit("vehicle")}>수정</button> : null}</div>
          <dl><div><dt>차량 진입</dt><dd>{accessLabel(profile.vehicle.access)}</dd></div><div><dt>하역 위치</dt><dd>{display(profile.vehicle.unloadingLocation)}</dd></div><div><dt>주차</dt><dd>{accessLabel(profile.vehicle.parking)}</dd></div><div><dt>차량 참고</dt><dd>{display(profile.vehicle.note)}</dd></div></dl>
        </SoftCard>
        <SoftCard className="field-section field-section--notes">
          <div className="field-section__heading"><div><span>04 · FIELD NOTE</span><h2>현장 특이사항</h2></div>{canEdit ? <button type="button" onClick={() => onEdit("fieldNotes")}>수정</button> : null}</div>
          <p>{display(profile.fieldNotes)}</p>
        </SoftCard>
      </div>
      {canEdit ? <button className="inspection-edit-link" type="button" onClick={() => onEdit("inspection")}><Icon name="clock" />검수시간 상세 수정<Icon name="chevron-right" /></button> : null}
    </>
  );
}

const SALES_STATUS_META = {
  before: { label: "방문 전", tone: "neutral" as const },
  completed: { label: "방문 완료", tone: "success" as const },
  followUp: { label: "후속 필요", tone: "attention" as const },
  revisit: { label: "재방문 필요", tone: "attention" as const },
  onHold: { label: "보류", tone: "info" as const },
};

function displayDateOnly(value: string | null) {
  if (!value) return null;
  const [, month, day] = value.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function SalesSchoolBrief({
  salesData,
  recorded,
  canRecord,
  onRecord,
}: {
  salesData: NonNullable<NonNullable<ReturnType<typeof useSchoolDetail>["detail"]>["salesData"]>;
  recorded: RecordedVisitSummary | null;
  canRecord: boolean;
  onRecord: () => void;
}) {
  const assignment = salesData.assignment;
  const profile = salesData.profile;
  const monthlyStatus = recorded?.result.monthlyStatus ?? assignment?.monthlyStatus ?? "before";
  const status = SALES_STATUS_META[monthlyStatus];
  const score = recorded?.interestScore ?? (profile?.interestEvaluated ? profile.interestScore : null);
  const followUp = recorded?.followUp ?? profile?.followUp ?? { required: false, dueDate: null, summary: null };
  const visitedBy = recorded?.visitedBy ?? profile?.latestVisit.visitedBy ?? null;
  const visitorName = salesData.employees.find((employee) => employee.employeeId === visitedBy)?.displayName ?? visitedBy;
  const brochureStatus = recorded?.brochureStatus ?? assignment?.brochureStatus ?? "unknown";
  const sampleStatus = recorded?.sampleStatus ?? assignment?.sampleStatus ?? "unknown";

  return (
    <section className="sales-school-brief" aria-labelledby="sales-school-brief-title">
      <div className="sales-school-brief__heading">
        <div><p>SALES · SCHOOL PULSE</p><h2 id="sales-school-brief-title">이번 달, 이어갈 대화.</h2></div>
        <StatusBadge tone={status.tone}>{assignment ? status.label : "이번 달 배정 없음"}</StatusBadge>
      </div>
      <div className="sales-school-brief__grid">
        <div className="sales-school-interest">
          <span>제품 관심도</span>
          <strong aria-label={score === null ? "제품 관심도 미평가" : `제품 관심도 ${INTEREST_META[score].label}`}>{interestHearts(score)}</strong>
          <small>{score === null ? "아직 평가 전" : INTEREST_META[score].label}</small>
        </div>
        <div className="sales-school-next" data-active={followUp.required}>
          <span>{followUp.required ? "다음 행동" : "후속 활동"}</span>
          <strong>{followUp.required ? followUp.summary : "예정된 후속 활동 없음"}</strong>
          <small>{followUp.required ? displayDateOnly(followUp.dueDate) : "이번 방문에서 바로 결정할 수 있어요."}</small>
        </div>
        <div className="sales-school-signals">
          <span><Icon name="clipboard" size={16} />홍보지 <strong>{brochureStatus === "delivered" ? "전달" : brochureStatus === "notDelivered" ? "미전달" : "미확인"}</strong></span>
          <span><Icon name="sparkles" size={16} />샘플 <strong>{sampleStatus === "delivered" ? "전달" : sampleStatus === "notDelivered" ? "미전달" : "미확인"}</strong></span>
          <span><Icon name="user" size={16} />최근 방문 <strong>{visitorName ?? "기록 없음"}</strong></span>
        </div>
      </div>
      <div className="sales-school-brief__footer">
        <span><Icon name="calendar" size={16} />{salesData.activeCycleId.replace("-", "년 ")}월 · {assignment ? `배정 개정 ${recorded?.result.assignmentRevision ?? assignment.revision}` : "팀 조회 전용"}</span>
        {canRecord ? <button type="button" onClick={onRecord}><Icon name="clipboard" />방문 기록 시작<Icon name="chevron-right" /></button> : <small>다른 직원의 배정은 조회만 가능합니다.</small>}
      </div>
    </section>
  );
}

function SalesContactBrief({
  profile,
  canEdit,
  onEdit,
}: {
  profile: SchoolFieldProfile | null;
  canEdit: boolean;
  onEdit: (section: EditorSection) => void;
}) {
  const contacts = [
    { label: "영양사 선생님", phone: profile?.contacts.dietitianPhone ?? null },
    { label: "급식실", phone: profile?.contacts.cafeteriaPhone ?? null },
  ];
  return (
    <section className="sales-contact-brief" aria-labelledby="sales-contact-brief-title">
      <div className="sales-contact-brief__heading">
        <span aria-hidden="true"><Icon name="phone" size={18} /></span>
        <div><p>QUICK CONTACT</p><h2 id="sales-contact-brief-title">학교 연락처</h2></div>
        {canEdit ? <button type="button" onClick={() => onEdit("contacts")}>연락처 수정</button> : null}
      </div>
      <div className="sales-contact-brief__list">
        {contacts.map((contact) => contact.phone ? (
          <a key={contact.label} href={phoneHref(contact.phone)} aria-label={`${contact.label} ${contact.phone} 전화`}>
            <span><strong>{contact.label}</strong><small>{contact.phone}</small></span>
            <b><Icon name="phone" size={15} />전화</b>
          </a>
        ) : (
          <div key={contact.label}>
            <span><strong>{contact.label}</strong><small>전화번호 미등록</small></span>
            <em>미등록</em>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SchoolDetail({
  school: initialSchool,
  session,
  mode,
}: {
  school: School;
  session: AuthenticatedSession;
  mode: WorkMode;
}) {
  const { showToast } = useToast();
  const detailState = useSchoolDetail(initialSchool, session, mode);
  const refreshDetail = detailState.refresh;
  const [editor, setEditor] = useState<EditorSection | null>(null);
  const [visitSheetOpen, setVisitSheetOpen] = useState(false);
  const [recordedVisit, setRecordedVisit] = useState<RecordedVisitSummary | null>(null);
  const [editingVisit, setEditingVisit] = useState<SalesVisit | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const detail = detailState.status === "ready" ? detailState.detail : null;
  const school = detail?.school ?? initialSchool;
  const profile = detail?.fieldProfile ?? null;
  const salesData = detail?.salesData ?? null;
  const address = school.address.road ?? school.address.jibun;
  const canEdit = session.claims.roleScopes.some((scope) => scope === "delivery" || scope === "sales" || scope === "admin");
  const canRecordVisit = mode === "sales" && Boolean(salesData?.assignment) && Boolean(
    session.claims.roleScopes.includes("admin")
    || salesData?.assignment?.assigneeIds.includes(session.claims.employeeId),
  );
  const directionsUrl = buildKakaoDirectionsUrl(school);
  const quickPhone = profile?.contacts.dietitianPhone ?? profile?.contacts.cafeteriaPhone ?? school.phone;

  const saveFieldProfile = async (patch: SchoolFieldProfilePatch) => {
    setSaving(true);
    try {
      await schoolDetailRepository.updateFieldProfile({
        schoolId: school.schoolId,
        expectedRevision: profile?.revision ?? 0,
        requestId: crypto.randomUUID(),
        appVersion: APP_METADATA.buildVersion,
        patch,
      });
      setEditor(null);
      refreshDetail();
      showToast("현장정보를 저장했습니다.", "success");
    } catch (error) {
      if (error instanceof FirebaseError && error.code === "functions/aborted") {
        refreshDetail();
        showToast("다른 직원이 먼저 수정했습니다. 최신 정보를 불러왔습니다.");
      } else {
        showToast(navigator.onLine ? "현장정보를 저장하지 못했습니다." : "인터넷 연결 후 다시 저장해주세요.");
      }
    } finally {
      setSaving(false);
    }
  };
  const openNewVisit = useCallback(() => {
    setEditingVisit(null);
    setVisitSheetOpen(true);
  }, []);
  const openVisitEditor = useCallback((visit: SalesVisit) => {
    setEditingVisit(visit);
    setVisitSheetOpen(true);
  }, []);
  const closeVisitSheet = useCallback(() => {
    setVisitSheetOpen(false);
    setEditingVisit(null);
  }, []);
  const handleVisitRecorded = useCallback((summary: RecordedVisitSummary) => {
    setRecordedVisit(summary);
    setVisitSheetOpen(false);
    setEditingVisit(null);
    setHistoryRefreshKey(`${summary.result.visitId}:${crypto.randomUUID()}`);
    refreshDetail();
    showToast(
      summary.operation === "updated"
        ? "최신 방문 기록을 수정했습니다."
        : summary.followUp.required
          ? "방문과 후속 일정을 함께 저장했습니다."
          : "방문 기록을 저장했습니다.",
      "success",
    );
  }, [refreshDetail, showToast]);
  const handleSalesProfileUpdated = useCallback(() => {
    setRecordedVisit(null);
    refreshDetail();
    showToast("커뮤니케이션 참고를 저장했습니다.", "success");
  }, [refreshDetail, showToast]);
  const visitAssignment = salesData?.assignment
    ? { ...salesData.assignment, revision: recordedVisit?.result.assignmentRevision ?? salesData.assignment.revision }
    : null;
  const currentNextAction = recordedVisit
    ? recordedVisit.followUp.required
      ? { dueDate: recordedVisit.followUp.dueDate, summary: recordedVisit.followUp.summary }
      : null
    : salesData?.profile?.nextAction.summary
      ? salesData.profile.nextAction
      : salesData?.profile?.followUp.required
        ? { dueDate: salesData.profile.followUp.dueDate, summary: salesData.profile.followUp.summary }
        : null;

  return (
    <section className="shell-page school-detail" aria-labelledby="school-detail-title">
      <div className="detail-hero">
        <div className="detail-hero__mark"><Icon name="building" size={30} /></div>
        <div>
          <div className="detail-hero__status">
            {mode === "delivery" ? <StatusBadge tone={profile && !profile.reviewRequired ? "success" : "attention"}>{profile ? `현장정보 ${profile.completeness}%` : "현장정보 미등록"}</StatusBadge> : <StatusBadge tone="info">영업 학교</StatusBadge>}
            {detailState.status === "ready" && detailState.refreshing ? <StatusBadge>최신 정보 확인 중</StatusBadge> : null}
          </div>
          <h1 id="school-detail-title">{school.name}</h1>
          <p><Icon name="location" size={17} />{address ?? "주소 정보 확인 필요"}</p>
          <small>{DISTRICT_LABELS[school.district]} · {SCHOOL_TYPE_LABELS[school.schoolType]} · {mode === "delivery" ? `현장정보 개정 ${profile?.revision ?? 0}` : "팀 영업 정보"}</small>
        </div>
      </div>

      {detailState.status === "ready" && detailState.stale ? (
        <div className="detail-network-state" role="status"><Icon name="sparkles" /><span><strong>오프라인 · 저장된 정보를 표시하고 있습니다.</strong><small>연결되면 최신 현장정보를 다시 확인합니다.</small></span></div>
      ) : null}

      {mode === "sales" && salesData ? (
        <SalesSchoolBrief salesData={salesData} recorded={recordedVisit} canRecord={canRecordVisit} onRecord={openNewVisit} />
      ) : null}

      {mode === "sales" && salesData ? (
        <SalesHistoryTimeline
          key={`history-${school.schoolId}`}
          schoolId={school.schoolId}
          employees={salesData.employeeDirectory}
          activityTags={salesData.activityTags}
          products={salesData.products}
          refreshKey={historyRefreshKey}
          teamReadOnly={!canRecordVisit}
          latestVisitId={recordedVisit?.result.visitId ?? salesData.assignment?.latestVisitId ?? null}
          onEditVisit={openVisitEditor}
        />
      ) : null}

      {mode === "delivery" ? <section className="field-workspace" aria-labelledby="field-workspace-title">
        <div className="field-workspace__heading"><div><p>{mode === "delivery" ? "DELIVERY FIELD BRIEF" : "SHARED FIELD BRIEF"}</p><h2 id="field-workspace-title">도착 전에, 필요한 것만.</h2></div><div className="field-workspace__actions">{profile ? <StatusBadge tone={profile.reviewRequired ? "attention" : "success"}>{profile.reviewRequired ? "보완 필요" : "현장 준비 완료"}</StatusBadge> : null}{profile && canEdit ? <button type="button" onClick={() => setEditor("all")}><Icon name="clipboard" size={16} />전체 편집</button> : null}</div></div>

        {detailState.status === "loading" ? <div className="field-loading"><SkeletonCard /><SkeletonCard /></div> : null}
        {detailState.status === "error" ? (
          <SoftCard className="field-empty-state" role="alert"><span><Icon name="building" /></span><h2>현장정보를 불러오지 못했어요.</h2><p>처음 보는 학교는 온라인 연결이 필요합니다.</p><GlassButton compact onClick={detailState.refresh}>다시 불러오기</GlassButton></SoftCard>
        ) : null}
        {detailState.status === "ready" && !profile ? (
          <SoftCard className="field-empty-state"><span><Icon name="sparkles" /></span><h2>아직 현장정보가 없습니다.</h2><p>검수시간, 대차, 엘리베이터, 급식실 동선과 하역 위치를 한 번에 남겨 공동자산으로 만드세요.</p>{canEdit ? <GlassButton variant="primary" onClick={() => setEditor("all")}>전체 현장정보 등록</GlassButton> : null}</SoftCard>
        ) : null}
        {profile ? <FieldInfoContent profile={profile} onEdit={setEditor} canEdit={canEdit} /> : null}
      </section> : null}

      {detailState.status === "ready" ? (
        <SchoolPhotoGallery
          schoolId={school.schoolId}
          photos={detailState.detail.photos}
          sessionNamespace={detailState.sessionNamespace}
          canEdit={canEdit}
          onRefresh={detailState.refresh}
        />
      ) : (
        <section className="school-photo-gallery school-photo-gallery--loading" role="status" aria-label="현장 사진 정보 불러오는 중">
          <div><span className="search-pulse" aria-hidden="true" /><strong>현장 사진 정보를 확인하고 있어요.</strong></div>
        </section>
      )}

      {mode === "sales" && salesData && visitAssignment ? (
        <SalesCollaboration
          key={`${school.schoolId}-${recordedVisit?.result.salesRevision ?? salesData.profile?.salesRevision ?? 0}`}
          schoolId={school.schoolId}
          assignment={visitAssignment}
          profile={salesData.profile}
          currentSalesRevision={recordedVisit?.result.salesRevision ?? salesData.profile?.salesRevision ?? 0}
          currentNextAction={currentNextAction}
          communicationTags={salesData.communicationTags}
          canEdit={canRecordVisit}
          onUpdated={handleSalesProfileUpdated}
        />
      ) : null}

      {mode === "sales" && detailState.status === "ready" ? <SalesContactBrief profile={profile} canEdit={canEdit} onEdit={setEditor} /> : null}

      {mode === "delivery" ? <SoftCard className="detail-information">
        <div className="detail-card-heading"><div><p className="shell-kicker">SCHOOL INFO</p><h2>학교 기본 정보</h2></div><StatusBadge>{SCHOOL_TYPE_LABELS[school.schoolType]}</StatusBadge></div>
        <dl><div><dt>지역</dt><dd>대전광역시 {DISTRICT_LABELS[school.district]}</dd></div><div><dt>대표 전화</dt><dd>{school.phone ?? "확인 필요"}</dd></div><div><dt>학교 코드</dt><dd>{school.source.schoolCode}</dd></div><div><dt>기본 정보</dt><dd>개정 {school.schoolBaseRevision}</dd></div></dl>
      </SoftCard> : null}

      <FloatingContextBar label="학교 빠른 작업">
        <a href={directionsUrl} target="_blank" rel="noreferrer"><Icon name="route" /><span>길안내</span></a>
        {mode === "sales" ? (
          quickPhone ? <a href={phoneHref(quickPhone)}><Icon name="phone" /><span>전화</span></a> : <button type="button" onClick={() => showToast("영양사·급식실 전화번호가 아직 등록되지 않았습니다.")}><Icon name="phone" /><span>전화 등록</span></button>
        ) : <button type="button" onClick={() => document.getElementById("school-photo-summary")?.scrollIntoView({ behavior: "smooth" })}><Icon name="building" /><span>사진</span></button>}
        {mode === "sales" ? (
          canRecordVisit ? <button className="visit-record-action" type="button" onClick={openNewVisit}><Icon name="clipboard" /><span>방문기록</span></button> : <button type="button" disabled><Icon name="clipboard" /><span>조회 전용</span></button>
        ) : canEdit ? <button type="button" onClick={() => setEditor("all")}><Icon name="clipboard" /><span>정보 수정</span></button> : null}
      </FloatingContextBar>

      <BottomSheet open={editor !== null} title={editor ? EDITOR_TITLES[editor] : "현장정보 수정"} description="현재 개정을 기준으로 안전하게 저장하며, 다른 직원의 수정과 충돌하면 최신 정보를 다시 불러옵니다." onClose={() => { if (!saving) setEditor(null); }}>
        {editor ? <FieldProfileEditor key={`${editor}-${profile?.revision ?? 0}`} section={editor} profile={profile} saving={saving} onSave={saveFieldProfile} /> : null}
      </BottomSheet>
      {visitSheetOpen && salesData && visitAssignment ? (
        <SalesVisitSheet
          school={school}
          assignment={visitAssignment}
          activityTags={salesData.activityTags.filter((tag) => tag.active)}
          products={salesData.products}
          promotedProductNames={salesData.promotedProductNames}
          employees={salesData.employees}
          employeeDirectory={salesData.employeeDirectory}
          session={session}
          initialVisit={editingVisit}
          expectedSalesRevision={recordedVisit?.result.salesRevision ?? salesData.profile?.salesRevision ?? 0}
          onClose={closeVisitSheet}
          onRecorded={handleVisitRecorded}
        />
      ) : null}
    </section>
  );
}
