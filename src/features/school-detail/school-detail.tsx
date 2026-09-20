"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import dynamic from "next/dynamic";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { FloatingContextBar } from "@/components/ui/floating-context-bar";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { OnnuriLoader } from "@/components/ui/onnuri-loader";
import { SchoolTypeMark } from "@/components/school/school-type-mark";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type {
  School,
  SchoolFieldProfile,
  SchoolFieldProfilePatch,
} from "@/domain/school";
import type { SalesVisit } from "@/domain/sales";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { SchoolWorkMode } from "@/features/app-shell/shell-policy";
import {
  INTEREST_META,
  interestHearts,
} from "@/features/sales-visit/heart-interest-selector";
import type { RecordedVisitSummary } from "@/features/sales-visit/sales-visit-sheet";
import { APP_METADATA } from "@/lib/app-metadata";
import { formatNullablePhoneNumber } from "@/lib/phone-number";
import { schoolDetailRepository } from "./school-detail-repository";
import { buildKakaoDirectionsUrl } from "./kakao-directions";
import { useSchoolDetail } from "./use-school-detail";
import { DeliveryFieldBrief, SchoolLocationBrief } from "./delivery-field-brief";
import styles from "./delivery-field-brief.module.css";

const SchoolPhotoGallery = dynamic(
  () => import("./school-photo-gallery").then((module) => module.SchoolPhotoGallery),
  {
    loading: () => (
      <section className={styles.photoLoading} role="status" aria-label="현장 사진 준비 중">
        <div><OnnuriLoader decorative /><strong>저장된 현장 사진을 준비하고 있어요.</strong></div>
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
      <BottomSheet open dismissible={false} title="방문 기록 준비 중" description="입력 화면을 안전하게 불러오고 있습니다." onClose={() => undefined}>
        <div className="sales-deferred-loading" role="status">잠시만 기다려주세요.</div>
      </BottomSheet>
    ),
  },
);

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
  fieldNotes: null,
} as const satisfies Pick<
  SchoolFieldProfile,
  "contacts" | "cafeteria" | "inspection" | "equipment" | "fieldNotes"
>;

type EditorSection = "all" | "contacts" | "cafeteria" | "salesLocation" | "inspection" | "equipment" | "fieldNotes";

const EDITOR_TITLES: Record<EditorSection, string> = {
  all: "현장정보 한 번에 입력",
  contacts: "학교 연락처 수정",
  cafeteria: "급식실 위치 수정",
  salesLocation: "급식실 위치 수정",
  inspection: "검수시간 수정",
  equipment: "이동 장비 수정",
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

function profileSection(profile: SchoolFieldProfile | null, section: EditorSection) {
  const source = profile ?? EMPTY_PROFILE;
  // Preserve cart/stair values when sales changes only the visible elevator.
  if (section === "salesLocation") return { cafeteria: { ...source.cafeteria }, equipment: { ...source.equipment } } satisfies SchoolFieldProfilePatch;
  if (section === "all") {
    return {
      contacts: { ...source.contacts },
      cafeteria: { ...source.cafeteria },
      inspection: { ...source.inspection },
      equipment: { ...source.equipment },
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
  saveError,
  onSave,
}: {
  section: EditorSection;
  profile: SchoolFieldProfile | null;
  saving: boolean;
  saveError: string | null;
  onSave: (patch: SchoolFieldProfilePatch) => Promise<void>;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<SchoolFieldProfilePatch>(() => profileSection(profile, section));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(draft);
  };

  return (
    <form id={formId} className="field-editor" data-full={section === "all"} onSubmit={submit}>
      {(section === "all" || section === "contacts") && draft.contacts ? (
        <div className="field-form-grid field-form-grid--contacts">
          {section === "all" ? <div className="field-editor-section-title"><div><strong>학교 연락처</strong><small>영양사 선생님과 급식실에 바로 연결되는 번호</small></div></div> : null}
          <label><span>영양사 선생님 전화</span><input type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={text(draft.contacts.dietitianPhone)} onChange={(event) => setDraft({ ...draft, contacts: { ...draft.contacts!, dietitianPhone: nullable(event.target.value) } })} onBlur={() => setDraft((current) => ({ ...current, contacts: { ...current.contacts!, dietitianPhone: formatNullablePhoneNumber(current.contacts!.dietitianPhone) } }))} placeholder="예: 010-1234-5678" /></label>
          <label><span>급식실 전화</span><input type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={text(draft.contacts.cafeteriaPhone)} onChange={(event) => setDraft({ ...draft, contacts: { ...draft.contacts!, cafeteriaPhone: nullable(event.target.value) } })} onBlur={() => setDraft((current) => ({ ...current, contacts: { ...current.contacts!, cafeteriaPhone: formatNullablePhoneNumber(current.contacts!.cafeteriaPhone) } }))} placeholder="예: 042-123-4567" /></label>
        </div>
      ) : null}

      {(section === "all" || section === "cafeteria" || section === "salesLocation") && draft.cafeteria ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><div><strong>급식실과 동선</strong><small>도착 후 바로 찾아갈 수 있는 위치 정보</small></div></div> : null}
          <label><span>건물</span><input value={text(draft.cafeteria.building)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, building: nullable(event.target.value) } })} placeholder="예: 본관" /></label>
          <label><span>층</span><input value={text(draft.cafeteria.floor)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, floor: nullable(event.target.value) } })} placeholder="예: 1층" /></label>
          <label className="field-form-grid__wide"><span>급식실 위치</span><textarea value={text(draft.cafeteria.locationDescription)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, locationDescription: nullable(event.target.value) } })} placeholder="정문에서 급식실까지 위치를 적어주세요." /></label>
          <label className="field-form-grid__wide"><span>출입구</span><textarea value={text(draft.cafeteria.entranceDescription)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, entranceDescription: nullable(event.target.value) } })} placeholder="사용할 출입구를 적어주세요." /></label>
          <label className="field-form-grid__wide"><span>이동 동선</span><textarea value={text(draft.cafeteria.routeDescription)} onChange={(event) => setDraft({ ...draft, cafeteria: { ...draft.cafeteria!, routeDescription: nullable(event.target.value) } })} placeholder="현장에서 빠르게 따라갈 수 있게 적어주세요." /></label>
        </div>
      ) : null}

      {(section === "all" || section === "inspection") && draft.inspection ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><div><strong>검수시간</strong><small>납품 일정과 혼잡 시간 안내</small></div></div> : null}
          <label><span>검수 시작</span><input type="time" value={text(draft.inspection.startTime)} onChange={(event) => setDraft({ ...draft, inspection: { ...draft.inspection!, startTime: nullable(event.target.value) } })} /></label>
          <label><span>검수 종료</span><input type="time" value={text(draft.inspection.endTime)} onChange={(event) => setDraft({ ...draft, inspection: { ...draft.inspection!, endTime: nullable(event.target.value) } })} /></label>
          <label className="field-form-grid__wide"><span>추가 설명</span><textarea value={text(draft.inspection.note)} onChange={(event) => setDraft({ ...draft, inspection: { ...draft.inspection!, note: nullable(event.target.value) } })} placeholder="혼잡 시간이나 주의사항을 적어주세요." /></label>
        </div>
      ) : null}

      {(section === "all" || section === "equipment" || section === "salesLocation") && draft.equipment ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><div><strong>이동 장비</strong><small>대차와 엘리베이터 사용 여부</small></div></div> : null}
          {section !== "salesLocation" ? <label><span>대차 필요</span><select value={draft.equipment.cartRequired} onChange={(event) => setDraft({ ...draft, equipment: { ...draft.equipment!, cartRequired: event.target.value as SchoolFieldProfile["equipment"]["cartRequired"] } })}><option value="required">필요</option><option value="notRequired">불필요</option><option value="unknown">확인 안 됨</option></select></label> : null}
          <label><span>엘리베이터</span><select value={draft.equipment.elevator} onChange={(event) => setDraft({ ...draft, equipment: { ...draft.equipment!, elevator: event.target.value as SchoolFieldProfile["equipment"]["elevator"] } })}><option value="available">있음</option><option value="unavailable">없음</option><option value="unknown">확인 안 됨</option></select></label>
        </div>
      ) : null}

      {section === "all" || section === "fieldNotes" ? (
        <div className="field-form-grid">
          {section === "all" ? <div className="field-editor-section-title"><div><strong>공동 현장 메모</strong><small>다음 직원에게 꼭 필요한 주의사항</small></div></div> : null}
          <label className="field-form-grid__wide"><span>현장 특이사항</span><textarea value={text(draft.fieldNotes ?? null)} onChange={(event) => setDraft({ ...draft, fieldNotes: nullable(event.target.value) })} placeholder="다음 직원이 꼭 알아야 할 내용을 적어주세요." /></label>
        </div>
      ) : null}

      <BottomSheetActions className="field-editor__actions" busy={saving}>
        {saveError ? <p className="sheet-action-error" role="alert">{saveError}</p> : null}
        <GlassButton variant="primary" type="submit" form={formId} disabled={saving}>{saving ? "저장 중…" : "변경사항 저장"}</GlassButton>
      </BottomSheetActions>
    </form>
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
        <span><Icon name="calendar" size={16} />{salesData.activeCycleId.replace("-", "년 ")}월</span>
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
  mode: SchoolWorkMode;
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
  const [fieldSaveError, setFieldSaveError] = useState<string | null>(null);
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

  const openFieldEditor = useCallback((section: EditorSection) => {
    if (!canEdit || detailState.status !== "ready") return;
    setFieldSaveError(null);
    setEditor(section);
  }, [canEdit, detailState.status]);

  const saveFieldProfile = async (patch: SchoolFieldProfilePatch) => {
    setFieldSaveError(null);
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
        setFieldSaveError("다른 직원이 먼저 수정했습니다. 최신 정보를 불러왔습니다. 내용을 확인한 뒤 다시 저장해주세요.");
      } else {
        setFieldSaveError(navigator.onLine ? "현장정보를 저장하지 못했습니다. 작성 내용은 유지됩니다. 다시 시도해주세요." : "인터넷 연결 후 다시 저장해주세요. 작성 내용은 유지됩니다.");
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
    <section className={`shell-page school-detail ${mode === "delivery" ? styles.page : ""}`} aria-labelledby="school-detail-title">
      <div className={mode === "delivery" ? styles.hero : "detail-hero"}>
        <SchoolTypeMark schoolType={school.schoolType} className={mode === "delivery" ? (styles.schoolMark ?? "") : ""} />
        <div>
          <h1 id="school-detail-title">{school.name}</h1>
          <p><Icon name="location" size={16} />{address ?? "주소 정보 확인 필요"}</p>
          {detailState.status === "ready" && detailState.refreshing ? <StatusBadge>최신 정보 확인 중</StatusBadge> : null}
        </div>
      </div>

      {detailState.status === "ready" && detailState.stale ? (
        <div className="detail-network-state" role="status"><Icon name="sparkles" /><span><strong>오프라인 · 저장된 정보를 표시하고 있습니다.</strong><small>연결되면 최신 현장정보를 다시 확인합니다.</small></span></div>
      ) : null}

      {mode === "sales" && salesData ? (
        <SalesSchoolBrief salesData={salesData} recorded={recordedVisit} canRecord={canRecordVisit} onRecord={openNewVisit} />
      ) : null}

      {mode === "sales" && detailState.status === "ready" ? <SalesContactBrief profile={profile} canEdit={canEdit} onEdit={openFieldEditor} /> : null}

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

      {mode === "delivery" ? (
        profile ? <DeliveryFieldBrief profile={profile} schoolPhone={school.phone} canEdit={canEdit} onEdit={() => openFieldEditor("all")} /> :
        <section className={styles.state} aria-labelledby="field-workspace-title" role={detailState.status === "error" ? "alert" : undefined}>
          <h2 id="field-workspace-title">납품 현장정보</h2>
          {detailState.status === "loading" ? <div role="status"><OnnuriLoader label="현장정보를 불러오는 중" /></div> :
            detailState.status === "error" ? <><p>현장정보를 불러오지 못했어요. 인터넷 연결을 확인해주세요.</p><GlassButton compact onClick={detailState.refresh}>다시 불러오기</GlassButton></> :
              <><p>검수시간과 급식실 위치를 아직 등록하지 않았어요.</p>{canEdit ? <GlassButton compact onClick={() => openFieldEditor("all")}>현장정보 등록</GlassButton> : null}</>}
          {school.phone ? <a href={phoneHref(school.phone)}>학교 대표 전화 · {school.phone}</a> : null}
        </section>
      ) : null}

      {mode === "sales" && detailState.status === "ready" ? <SchoolLocationBrief profile={profile} canEdit={canEdit} onEdit={() => openFieldEditor("salesLocation")} /> : null}

      {detailState.status === "ready" ? (
        <SchoolPhotoGallery
          schoolId={school.schoolId}
          photos={detailState.detail.photos}
          sessionNamespace={detailState.sessionNamespace}
          canEdit={canEdit}
          onRefresh={detailState.refresh}
        />
      ) : (
        <section className={styles.photoLoading} role="status" aria-label="현장 사진 정보 불러오는 중">
          <div><OnnuriLoader decorative /><strong>현장 사진 정보를 확인하고 있어요.</strong></div>
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


      <FloatingContextBar label="학교 빠른 작업">
        <a href={directionsUrl} target="_blank" rel="noreferrer"><Icon name="route" /><span>길안내</span></a>
        {mode === "sales" ? (
          quickPhone ? <a href={phoneHref(quickPhone)}><Icon name="phone" /><span>전화</span></a> : <button type="button" disabled={!canEdit || detailState.status !== "ready"} onClick={() => openFieldEditor("contacts")}><Icon name="phone" /><span>{canEdit ? "전화 등록" : "연락처 없음"}</span></button>
        ) : <button type="button" onClick={() => document.getElementById("school-photo-summary")?.scrollIntoView({ behavior: "smooth" })}><Icon name="building" /><span>사진</span></button>}
        {mode === "sales" ? (
          canRecordVisit ? <button className="visit-record-action" type="button" onClick={openNewVisit}><Icon name="clipboard" /><span>방문기록</span></button> : <button type="button" disabled><Icon name="clipboard" /><span>조회 전용</span></button>
        ) : canEdit ? <button type="button" onClick={() => openFieldEditor("all")}><Icon name="clipboard" /><span>정보 수정</span></button> : null}
      </FloatingContextBar>

      <BottomSheet open={editor !== null} title={editor ? EDITOR_TITLES[editor] : "현장정보 수정"} onClose={() => { if (!saving) setEditor(null); }}>
        {editor ? <FieldProfileEditor key={`${editor}-${profile?.revision ?? 0}`} section={editor} profile={profile} saving={saving} saveError={fieldSaveError} onSave={saveFieldProfile} /> : null}
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
