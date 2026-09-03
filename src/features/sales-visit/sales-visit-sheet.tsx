"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { SmartChip } from "@/components/ui/smart-chip";
import type { Product, TagDefinition } from "@/domain/catalog";
import type { EmployeeDirectory } from "@/domain/identity";
import type { InterestScore, SalesAssignment, SalesVisit } from "@/domain/sales";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { APP_METADATA } from "@/lib/app-metadata";
import { HeartInterestSelector } from "./heart-interest-selector";
import {
  recordSalesVisitInputSchema,
  todayInSeoul,
  updateSalesVisitInputSchema,
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
  operation: "created" | "updated";
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
  const statusLabel = value === "delivered"
    ? "전달 완료"
    : value === "notDelivered"
      ? "미전달"
      : "선택 필요";

  return (
    <fieldset className="visit-binary-choice" data-value={value ?? "unset"}>
      <legend>{label} <em>필수</em><span>{statusLabel}</span></legend>
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

function initialSampleProductNames(visit: SalesVisit | null, products: Product[]) {
  if (!visit) return [];
  const namesById = new Map(products.map((product) => [product.productId, product.shortName ?? product.name]));
  return visit.sample.items.map((item) =>
    "productName" in item ? item.productName : namesById.get(item.productId) ?? item.productId,
  );
}

function uniqueProductNames(names: string[]) {
  const seen = new Set<string>();
  return names.filter((candidate) => {
    const normalized = candidate.trim().toLocaleLowerCase("ko-KR");
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).map((name) => name.trim());
}

function visitorChoices(
  employees: EmployeeDirectory[],
  directory: EmployeeDirectory[],
  session: AuthenticatedSession,
  initialVisit: SalesVisit | null,
) {
  const choices = new Map(employees.map((employee) => [employee.employeeId, employee]));
  if (!choices.has(session.claims.employeeId)) {
    choices.set(session.claims.employeeId, {
      employeeId: session.claims.employeeId,
      displayName: session.displayName,
      active: true,
      displayOrder: Number.MAX_SAFE_INTEGER - 1,
    });
  }
  if (initialVisit && !choices.has(initialVisit.visitedBy)) {
    const savedVisitor = directory.find((employee) => employee.employeeId === initialVisit.visitedBy);
    choices.set(initialVisit.visitedBy, savedVisitor ?? {
      employeeId: initialVisit.visitedBy,
      displayName: "기존 방문자",
      active: true,
      displayOrder: Number.MAX_SAFE_INTEGER,
    });
  }
  return [...choices.values()];
}

export function SalesVisitSheet({
  school,
  assignment,
  activityTags,
  products,
  promotedProductNames,
  employees,
  employeeDirectory,
  session,
  initialVisit = null,
  expectedSalesRevision,
  onClose,
  onRecorded,
}: {
  school: School;
  assignment: SalesAssignment;
  activityTags: TagDefinition[];
  products: Product[];
  promotedProductNames: string[];
  employees: EmployeeDirectory[];
  employeeDirectory: EmployeeDirectory[];
  session: AuthenticatedSession;
  initialVisit?: SalesVisit | null;
  expectedSalesRevision: number;
  onClose: () => void;
  onRecorded: (summary: RecordedVisitSummary) => void;
}) {
  const visitDateWindow = visitDateWindowForCycle(assignment.cycleId);
  const editing = initialVisit !== null;
  const [visitedDate, setVisitedDate] = useState(() => initialVisit ? todayInSeoul(initialVisit.visitedAt) : visitDateWindow.initial);
  const [visitedBy, setVisitedBy] = useState(initialVisit?.visitedBy ?? session.claims.employeeId);
  const [brochureStatus, setBrochureStatus] = useState<DeliveryChoice>(initialVisit?.brochure.status ?? null);
  const [sampleStatus, setSampleStatus] = useState<DeliveryChoice>(initialVisit?.sample.status ?? null);
  const initialNames = initialSampleProductNames(initialVisit, products);
  const initialCustomNames = initialNames.filter((name) => !promotedProductNames.includes(name));
  const [selectedPromotedNames, setSelectedPromotedNames] = useState(() => initialNames.filter((name) => promotedProductNames.includes(name)));
  const [customSampleNames, setCustomSampleNames] = useState(() => initialCustomNames.slice(1));
  const [customSampleDraft, setCustomSampleDraft] = useState(() => initialCustomNames[0] ?? "");
  const [customSampleOpen, setCustomSampleOpen] = useState(() => promotedProductNames.length === 0 || initialCustomNames.length > 0);
  const [interestScore, setInterestScore] = useState<InterestScore | null>(initialVisit?.interest.score ?? null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialVisit?.activityTagIds ?? []);
  const [summary, setSummary] = useState(initialVisit?.summary ?? "");
  const [followUpRequired, setFollowUpRequired] = useState(initialVisit?.followUp.required ?? false);
  const [followUpDate, setFollowUpDate] = useState(initialVisit?.followUp.dueDate ?? "");
  const [followUpSummary, setFollowUpSummary] = useState(initialVisit?.followUp.summary ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const savingRef = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const handleClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);
  const visitorOptions = visitorChoices(employees, employeeDirectory, session, initialVisit);
  const resolvedSampleNames = uniqueProductNames([
    ...selectedPromotedNames,
    ...customSampleNames,
    ...(customSampleDraft.trim() ? [customSampleDraft] : []),
  ]);

  const chooseSampleStatus = (value: Exclude<DeliveryChoice, null>) => {
    setSampleStatus(value);
    if (value === "notDelivered") {
      setSelectedPromotedNames([]);
      setCustomSampleNames([]);
      setCustomSampleDraft("");
    }
  };
  const togglePromotedProduct = (name: string) => {
    setSelectedPromotedNames((current) => current.includes(name)
      ? current.filter((candidate) => candidate !== name)
      : [...current, name]);
  };
  const addCustomSample = () => {
    const name = customSampleDraft.trim();
    if (!name) return;
    setCustomSampleNames((current) => uniqueProductNames([...current, name]));
    setCustomSampleDraft("");
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
    if (sampleStatus === "delivered" && resolvedSampleNames.length === 0) next.push("전달한 샘플 제품을 하나 이상 선택하거나 입력해주세요.");
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
    const content = {
      cycleId: assignment.cycleId,
      schoolId: school.schoolId,
      expectedAssignmentRevision: assignment.revision,
      visitedDate,
      visitedBy,
      brochureStatus,
      sample: {
        status: sampleStatus,
        items: sampleStatus === "delivered"
          ? resolvedSampleNames.map((productName) => ({ productName }))
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
    };
    const parsed = editing && initialVisit
      ? updateSalesVisitInputSchema.safeParse({
          ...content,
          visitId: initialVisit.visitId,
          expectedVisitRevision: initialVisit.revision,
          expectedSalesRevision,
        })
      : recordSalesVisitInputSchema.safeParse(content);
    if (!parsed.success) {
      setErrors(["입력한 날짜와 방문 내용을 다시 확인해주세요."]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = editing
        ? await salesVisitRepository.update(updateSalesVisitInputSchema.parse(parsed.data), session)
        : await salesVisitRepository.record(recordSalesVisitInputSchema.parse(parsed.data), session);
      onRecorded({
        result,
        interestScore,
        brochureStatus,
        sampleStatus,
        visitedBy,
        summary: summary.trim(),
        followUp: parsed.data.followUp,
        operation: editing ? "updated" : "created",
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
      title={editing ? "방문 기록 수정" : "방문 기록"}
      description={editing
        ? `${school.name} · 가장 최근 기록의 저장된 내용을 불러왔습니다.`
        : `${school.name} · 방문일은 오늘로 준비하고 이번 달 활동을 기록합니다.`}
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
        {editing ? <div className="visit-editing-note"><Icon name="clock" size={17} /><span><strong>저장된 최신 기록을 수정합니다.</strong><small>기존 값을 유지한 채 필요한 부분만 바꿀 수 있어요.</small></span></div> : null}
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
            <div className="visit-sample-items__heading">
              <div><h3 id="sample-items-title">전달 샘플</h3><span>제품을 탭해 빠르게 복수 선택하세요.</span></div>
              <strong>{resolvedSampleNames.length}개 선택</strong>
            </div>
            {promotedProductNames.length > 0 ? (
              <div className="visit-campaign-products" role="group" aria-label="이번 달 홍보 제품">
                {promotedProductNames.map((name) => {
                  const selected = selectedPromotedNames.includes(name);
                  return (
                    <button key={name} type="button" aria-pressed={selected} data-selected={selected} onClick={() => togglePromotedProduct(name)}>
                      <span aria-hidden="true">{selected ? <Icon name="check" size={16} /> : null}</span>
                      {name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="visit-campaign-products__empty"><Icon name="sparkles" size={16} />이번 달 제품 목록을 준비 중입니다. 직접 입력은 바로 사용할 수 있어요.</p>
            )}
            <button className="visit-custom-product-toggle" type="button" aria-expanded={customSampleOpen} onClick={() => setCustomSampleOpen((current) => !current)}>
              <Icon name="plus" size={17} />목록에 없는 제품 직접 입력
            </button>
            {customSampleOpen ? (
              <div className="visit-custom-product">
                <label>
                  <span>제품명</span>
                  <input
                    type="text"
                    autoComplete="off"
                    enterKeyHint="done"
                    maxLength={120}
                    value={customSampleDraft}
                    placeholder="현장에서 부르는 제품명"
                    onChange={(event) => setCustomSampleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomSample();
                      }
                    }}
                  />
                </label>
                <button type="button" disabled={!customSampleDraft.trim()} onClick={addCustomSample}>추가</button>
              </div>
            ) : null}
            {customSampleNames.length > 0 ? (
              <div className="visit-custom-product-list" aria-label="직접 입력한 제품">
                {customSampleNames.map((name) => (
                  <span key={name}>{name}<button type="button" aria-label={`${name} 삭제`} onClick={() => setCustomSampleNames((current) => current.filter((candidate) => candidate !== name))}><Icon name="close" size={13} /></button></span>
                ))}
              </div>
            ) : null}
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
          <button type="submit" disabled={saving}>{saving ? "안전하게 저장 중…" : editing ? "수정 내용 저장" : "방문 기록 저장"}</button>
        </div>
      </form>
    </BottomSheet>
  );
}
