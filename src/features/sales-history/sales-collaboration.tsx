"use client";

import { useMemo, useRef, useState } from "react";
import { FirebaseError } from "firebase/app";
import { FunctionsError } from "firebase/functions";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { SmartChip } from "@/components/ui/smart-chip";
import type { TagDefinition } from "@/domain/catalog";
import type { SalesAssignment, SalesProfile } from "@/domain/sales";
import { APP_METADATA } from "@/lib/app-metadata";
import { salesHistoryRepository } from "./sales-history-repository";
import type { UpdateSalesProfileResult } from "./sales-history-contract";

const DEFAULT_COMMUNICATION_TAGS = [
  { tagId: "COMM-TEXT", label: "문자 연락 선호", active: true },
  { tagId: "COMM-CALL", label: "전화 연락 선호", active: true },
  { tagId: "COMM-DETAIL", label: "상세 자료 선호", active: true },
  { tagId: "COMM-BEFORE-VISIT", label: "방문 전 연락 필요", active: true },
  { tagId: "COMM-SAMPLE-REQUEST", label: "샘플 사전 요청", active: true },
  { tagId: "COMM-REGULAR-MATERIAL", label: "정기 자료 요청", active: true },
] as const;

function communicationTagOptions(tags: TagDefinition[]) {
  const options = tags.map(({ tagId, label, active }) => ({ tagId, label, active }));
  const knownIds = new Set(options.map((tag) => tag.tagId));
  for (const tag of DEFAULT_COMMUNICATION_TAGS) {
    if (!knownIds.has(tag.tagId)) options.push({ ...tag });
  }
  return options;
}

function profileError(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/aborted") return "다른 직원이 먼저 정보를 수정했습니다. 최신 내용을 확인해주세요.";
    if (error.code === "functions/permission-denied") return "이 학교의 협업 정보를 수정할 권한이 없습니다.";
    if (error.code === "functions/failed-precondition") return "현재 배정과 선택한 태그를 다시 확인해주세요.";
  }
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "인터넷 연결 후 다시 저장해주세요. 선택 내용은 그대로 유지됩니다."
    : "커뮤니케이션 참고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function displayDueDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

export function SalesCollaboration({
  schoolId,
  assignment,
  profile,
  currentSalesRevision,
  currentNextAction,
  communicationTags,
  canEdit,
  onUpdated,
}: {
  schoolId: string;
  assignment: SalesAssignment;
  profile: SalesProfile | null;
  currentSalesRevision: number;
  currentNextAction: { dueDate: string | null; summary: string | null } | null;
  communicationTags: TagDefinition[];
  canEdit: boolean;
  onUpdated: (result: UpdateSalesProfileResult) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [savedTagIds, setSavedTagIds] = useState(profile?.communicationTagIds ?? []);
  const [draftTagIds, setDraftTagIds] = useState<string[]>([]);
  const [salesRevision, setSalesRevision] = useState(currentSalesRevision);
  const [assignmentRevision, setAssignmentRevision] = useState(assignment.revision);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestIdRef = useRef(crypto.randomUUID());
  const availableTags = useMemo(() => communicationTagOptions(communicationTags), [communicationTags]);
  const tagLabels = useMemo(() => new Map(availableTags.map((tag) => [tag.tagId, tag.label])), [availableTags]);
  const activeTags = useMemo(() => availableTags.filter((tag) => tag.active), [availableTags]);

  const openEditor = () => {
    const activeIds = new Set(activeTags.map((tag) => tag.tagId));
    setDraftTagIds(savedTagIds.filter((tagId) => activeIds.has(tagId)));
    setSaveError(null);
    setEditorOpen(true);
  };
  const toggleTag = (tagId: string) => {
    if (saveError) requestIdRef.current = crypto.randomUUID();
    setSaveError(null);
    setDraftTagIds((current) => current.includes(tagId)
      ? current.filter((currentTagId) => currentTagId !== tagId)
      : [...current, tagId]);
  };
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await salesHistoryRepository.updateProfile({
        cycleId: assignment.cycleId,
        schoolId,
        expectedAssignmentRevision: assignmentRevision,
        expectedSalesRevision: salesRevision,
        communicationTagIds: draftTagIds,
        requestId: requestIdRef.current,
        appVersion: APP_METADATA.buildVersion,
      });
      setSavedTagIds(result.communicationTagIds);
      setSalesRevision(result.salesRevision);
      requestIdRef.current = crypto.randomUUID();
      setEditorOpen(false);
      onUpdated(result);
    } catch (error) {
      if (error instanceof FunctionsError && error.code === "functions/aborted") {
        const details = error.details as { conflictType?: unknown; actualRevision?: unknown } | undefined;
        if (details?.conflictType === "salesProfile" && typeof details.actualRevision === "number") {
          setSalesRevision(details.actualRevision);
        }
        if (details?.conflictType === "assignment" && typeof details.actualRevision === "number") {
          setAssignmentRevision(details.actualRevision);
        }
      }
      setSaveError(profileError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="sales-collaboration" aria-labelledby="sales-collaboration-title">
      <div className="sales-collaboration__heading">
        <div><p>TEAM HANDOFF · SCHOOL MEMORY</p><h2 id="sales-collaboration-title">다음 사람이 바로 이어갈 수 있게.</h2></div>
        {canEdit ? <button type="button" onClick={openEditor}><Icon name="sparkles" size={16} />업무 참고 편집</button> : <small>담당 직원만 편집</small>}
      </div>
      <div className="sales-collaboration__grid">
        <div className="sales-next-action" data-active={Boolean(currentNextAction)}>
          <span><Icon name="calendar" size={17} />다음 행동</span>
          <strong>{currentNextAction?.summary ?? "예정된 후속 활동 없음"}</strong>
          <small>{currentNextAction ? `${displayDueDate(currentNextAction.dueDate) ? `${displayDueDate(currentNextAction.dueDate)} · ` : ""}다음 달에도 유지됩니다.` : "방문 기록에서 후속 일정을 남길 수 있습니다."}</small>
        </div>
        <div className="communication-reference">
          <span><Icon name="user" size={17} />커뮤니케이션 참고</span>
          {savedTagIds.length > 0 ? <div>{savedTagIds.map((tagId) => <em key={tagId}>{tagLabels.get(tagId) ?? "비활성 참고 태그"}</em>)}</div> : <strong>아직 등록된 업무 참고가 없습니다.</strong>}
          <small>방문 활동 태그와 달리 월이 바뀌어도 학교에 유지됩니다.</small>
        </div>
      </div>
      {!canEdit ? <p className="sales-collaboration__readonly"><Icon name="check" size={15} />팀 기록은 읽을 수 있지만 다른 담당자의 학교 참고정보는 변경할 수 없습니다.</p> : null}

      <BottomSheet
        open={editorOpen}
        title="커뮤니케이션 참고"
        description="사람에 대한 평가가 아니라, 다음 대화를 돕는 업무 방식만 선택해주세요."
        onClose={() => { if (!saving) setEditorOpen(false); }}
      >
        <div className="communication-editor">
          <div className="communication-editor__note"><Icon name="sparkles" /><span><strong>학교에 지속되는 참고정보</strong>월별 활동 태그와 분리되어 다음 Cycle에도 유지됩니다.</span></div>
          <fieldset aria-describedby="communication-tag-help">
            <legend>업무 참고 태그 <span>복수 선택</span></legend>
            <div className="communication-editor__tag-grid">
              {activeTags.map((tag) => (
                <SmartChip key={tag.tagId} selected={draftTagIds.includes(tag.tagId)} onClick={() => toggleTag(tag.tagId)}>
                  <span aria-hidden="true"><Icon name="check" size={14} /></span>{tag.label}
                </SmartChip>
              ))}
            </div>
            <small id="communication-tag-help">해당 학교에서 반복되는 연락 방식만 골라주세요.</small>
          </fieldset>
          {saveError ? <p className="communication-editor__error" role="alert">{saveError}</p> : null}
          <div className="communication-editor__actions"><button type="button" disabled={saving} onClick={() => setEditorOpen(false)}>취소</button><button type="button" disabled={saving} onClick={() => void save()}>{saving ? "안전하게 저장 중…" : "업무 참고 저장"}</button></div>
        </div>
      </BottomSheet>
    </section>
  );
}
