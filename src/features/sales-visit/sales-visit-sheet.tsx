"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { SmartChip } from "@/components/ui/smart-chip";
import type { TagDefinition } from "@/domain/catalog";
import type { EmployeeDirectory } from "@/domain/identity";
import type { InterestScore, SalesAssignment } from "@/domain/sales";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { APP_METADATA } from "@/lib/app-metadata";
import { HeartInterestSelector } from "./heart-interest-selector";
import {
  recordSalesVisitInputSchema,
  visitDateWindowForCycle,
  type RecordSalesVisitResult,
} from "./sales-visit-contract";
import { salesVisitRepository } from "./sales-visit-repository";

type DeliveryChoice = "delivered" | "notDelivered" | null;

export type RecordedVisitSummary = {
  result: RecordSalesVisitResult;
  interestScore: InterestScore;
  brochureStatus: Exclude<DeliveryChoice, null>;
  sampleStatus: Exclude<DeliveryChoice, null>;
  visitedBy: string;
  summary: string;
  followUp: { required: boolean; dueDate: string | null; summary: string | null };
};

function BinaryChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DeliveryChoice;
  onChange: (value: Exclude<DeliveryChoice, null>) => void;
}) {
  return (
    <fieldset className="visit-binary-choice">
      <legend>{label} <em>필수</em></legend>
      <div role="radiogroup" aria-label={`${label} 전달 여부`}>
        <button type="button" role="radio" aria-checked={value === "delivered"} data-selected={value === "delivered"} onClick={() => onChange("delivered")}><Icon name="check" />전달</button>
        <button type="button" role="radio" aria-checked={value === "notDelivered"} data-selected={value === "notDelivered"} onClick={() => onChange("notDelivered")}><Icon name="close" />미전달</button>
      </div>
    </fieldset>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    const detail = error.message
      .replace(/^Firebase:\s*/i, "")
      .replace(/\s*\[\d{3}\]\s*$/u, "")
      .trim();
    if (error.code === "functions/aborted") return "배정 정보가 변경되었습니다. 닫은 뒤 최신 정보를 확인해주세요.";
    if (error.code === "functions/permission-denied") return "이 학교의 방문 기록을 저장할 권한이 없습니다.";
    if (error.code === "functions/failed-precondition" || error.code === "functions/invalid-argument") {
      return detail || "방문일과 입력 내용을 확인해주세요.";
    }
  }
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "인터넷 연결 후 다시 저장해주세요. 작성 내용은 그대로 유지됩니다."
    : "방문 기록을 저장하지 못했습니다. 작성 내용을 확인한 뒤 다시 시도해주세요.";
}

export function SalesVisitSheet({
  school,
  assignment,
  activityTags,
  employees,
  session,
  onClose,
  onRecorded,
}: {
  school: School;
  assignment: SalesAssignment;
  activityTags: TagDefinition[];
  employees: EmployeeDirectory[];
  session: AuthenticatedSession;
  onClose: () => void;
  onRecorded: (summary: RecordedVisitSummary) => void;
}) {
  const visitDateWindow = visitDateWindowForCycle(assignment.cycleId);
  const [visitedDate, setVisitedDate] = useState(() => visitDateWindow.initial);
  const [visitedBy, setVisitedBy] = useState(session.claims.employeeId);
  const [brochureStatus, setBrochureStatus] = useState<DeliveryChoice>(null);
  const [sampleStatus, setSampleStatus] = useState<DeliveryChoice>(null);
  const [sampleProductName, setSampleProductName] = useState("");
  const [interestScore, setInterestScore] = useState<InterestScore | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpSummary, setFollowUpSummary] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const savingRef = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const handleClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);
  const visitorOptions = employees.some((employee) => employee.employeeId === session.claims.employeeId)
    ? employees
    : [{ employeeId: session.claims.employeeId, displayName: session.displayName }, ...employees];

  const chooseSampleStatus = (value: Exclude<DeliveryChoice, null>) => {
    setSampleStatus(value);
    if (value === "notDelivered") setSampleProductName("");
  };
  const clearFeedback = () => {
    if (errors.length > 0) setErrors([]);
    if (saveError) setSaveError(null);
  };

  const validate = () => {
    const next: string[] = [];
    if (!visitDateWindow.available) next.push(`${assignment.cycleId.replace("-", "년 ")}월 배정의 방문 기록 가능 기간이 아직 시작되지 않았습니다.`);
    if (!visitedDate) next.push("방문 날짜를 선택해주세요.");
    if (!visitedBy) next.push("실제 방문자를 선택해주세요.");
    if (brochureStatus === null) next.push("홍보지 전달 여부를 선택해주세요.");
    if (sampleStatus === null) next.push("샘플 전달 여부를 선택해주세요.");
    if (sampleStatus === "delivered" && sampleProductName.trim().length === 0) next.push("전달한 샘플 제품명을 입력해주세요.");
    if (interestScore === null) next.push("제품 관심도를 선택해주세요. 미확인도 직접 선택할 수 있습니다.");
    if (summary.trim().length < 2) next.push("방문 결과를 한 줄 이상 입력해주세요.");
    if (followUpRequired && (!followUpDate || followUpSummary.trim().length < 2)) next.push("후속 날짜와 내용을 입력해주세요.");
    setErrors(next);
    if (next.length > 0) {
      requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
      });
    }
    return next.length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    if (!validate() || brochureStatus === null || sampleStatus === null || interestScore === null) return;
    const parsed = recordSalesVisitInputSchema.safeParse({
      cycleId: assignment.cycleId,
      schoolId: school.schoolId,
      expectedAssignmentRevision: assignment.revision,
      visitedDate,
      visitedBy,
      brochureStatus,
      sample: {
        status: sampleStatus,
        items: sampleStatus === "delivered"
          ? [{ productName: sampleProductName.trim() }]
          : [],
      },
      interestScore,
      activityTagIds: selectedTagIds,
      summary: summary.trim(),
      followUp: followUpRequired
        ? { required: true, dueDate: followUpDate, summary: followUpSummary.trim() }
        : { required: false, dueDate: null, summary: null },
      requestId,
      appVersion: APP_METADATA.buildVersion,
    });
    if (!parsed.success) {
      setErrors(["입력한 날짜와 방문 내용을 다시 확인해주세요."]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await salesVisitRepository.record(parsed.data, session);
      onRecorded({
        result,
        interestScore,
        brochureStatus,
        sampleStatus,
        visitedBy,
        summary: summary.trim(),
        followUp: parsed.data.followUp,
      });
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title="방문 기록"
      description={`${school.name} · 담당자와 실제 방문자를 구분해 이번 달 활동을 기록합니다.`}
      onClose={handleClose}
    >
      <form
        className="sales-visit-form"
        onChange={clearFeedback}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('button:not([type="submit"])')) clearFeedback();
        }}
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <div className="sales-visit-form__identity">
          <label>
            방문일 <em>필수</em>
            <input type="date" min={visitDateWindow.earliest} max={visitDateWindow.latest} value={visitedDate} onChange={(event) => setVisitedDate(event.target.value)} />
            {visitDateWindow.isEarlyWindow ? <small className="visit-date-guidance">다음 달 배정은 시작 7일 전부터 사전 방문을 기록할 수 있어요.</small> : null}
          </label>
          <label>실제 방문자 <em>필수</em><select value={visitedBy} onChange={(event) => setVisitedBy(event.target.value)}>{visitorOptions.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.displayName}</option>)}</select></label>
          <p><Icon name="user" size={16} />기록 입력자는 {session.displayName}님으로 별도 저장됩니다.</p>
        </div>

        <div className="sales-visit-form__delivery-grid">
          <BinaryChoice label="홍보지" value={brochureStatus} onChange={setBrochureStatus} />
          <BinaryChoice label="샘플" value={sampleStatus} onChange={chooseSampleStatus} />
        </div>

        {sampleStatus === "delivered" ? (
          <section className="visit-sample-items" aria-labelledby="sample-items-title">
            <div><h3 id="sample-items-title">전달 샘플</h3><span>현장에서 부르는 제품명을 그대로 남겨주세요.</span></div>
            <label className="visit-sample-name">
              <span>제품명 <em>필수</em></span>
              <input
                type="text"
                autoComplete="off"
                enterKeyHint="next"
                maxLength={120}
                value={sampleProductName}
                placeholder="예: 우리쌀 떡볶이 순한맛"
                onChange={(event) => setSampleProductName(event.target.value)}
              />
              <small>{sampleProductName.length}/120 · 수량은 기록하지 않습니다.</small>
            </label>
          </section>
        ) : null}

        <HeartInterestSelector value={interestScore} onChange={setInterestScore} />

        <fieldset className="visit-activity-tags">
          <legend>활동 태그 <span>복수 선택</span></legend>
          {activityTags.length > 0 ? (
            <div>{activityTags.map((tag) => <SmartChip key={tag.tagId} selected={selectedTagIds.includes(tag.tagId)} onClick={() => setSelectedTagIds((current) => current.includes(tag.tagId) ? current.filter((tagId) => tagId !== tag.tagId) : [...current, tag.tagId])}>{tag.label}</SmartChip>)}</div>
          ) : (
            <p className="visit-activity-tags__empty"><Icon name="sparkles" size={17} />활동 태그 기준정보를 준비 중입니다. 방문 기록은 태그 없이도 저장할 수 있습니다.</p>
          )}
        </fieldset>

        <label className="visit-summary-field">방문 결과 <em>필수</em><textarea maxLength={500} rows={3} value={summary} placeholder="예: 샘플 사용 후 단가를 다시 확인하기로 했습니다." onChange={(event) => setSummary(event.target.value)} /><span>{summary.length}/500</span></label>

        <section className="visit-follow-up" data-active={followUpRequired}>
          <button type="button" role="switch" aria-checked={followUpRequired} onClick={() => { setFollowUpRequired((current) => !current); setFollowUpDate(""); setFollowUpSummary(""); }}><span><strong>후속 필요</strong><small>다음 행동을 일정으로 남깁니다.</small></span><i aria-hidden="true" /></button>
          {followUpRequired ? <div><label>후속 날짜 <em>필수</em><input type="date" min={visitedDate} value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} /></label><label>후속 내용 <em>필수</em><input type="text" maxLength={300} value={followUpSummary} placeholder="예: 샘플 반응 확인 전화" onChange={(event) => setFollowUpSummary(event.target.value)} /></label></div> : null}
        </section>

        {errors.length > 0 ? <div ref={errorSummaryRef} className="visit-form-errors" role="alert" tabIndex={-1}><strong>저장 전에 확인해주세요.</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
        {saveError ? <div className="visit-form-save-error" role="alert"><Icon name="sparkles" /><span><strong>저장하지 못했어요.</strong>{saveError}</span></div> : null}

        <div className="sales-visit-form__submit">
          <p><Icon name="check" size={16} />한 번의 저장으로 방문·학교 상태·통계가 함께 반영됩니다.</p>
          <button type="submit" disabled={saving}>{saving ? "안전하게 저장 중…" : "방문 기록 저장"}</button>
        </div>
      </form>
    </BottomSheet>
  );
}
