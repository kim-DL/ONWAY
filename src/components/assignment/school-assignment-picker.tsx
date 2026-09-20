"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { BottomSheetActions } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";

export const MAX_BULK_ASSIGNMENT_COUNT = 400;

export type AssignmentCandidate = {
  schoolId: string;
  name: string;
  district: string;
  schoolType: string;
  address: string | null;
};

const DISTRICT_LABELS: Record<string, string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타",
};

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, "");
}

function MasterCheckbox({
  checked,
  indeterminate,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} />;
}

export function SchoolAssignmentPicker({
  candidates,
  busy,
  actionLabel,
  emptyTitle = "조건에 맞는 미배정 학교가 없습니다.",
  submitErrorMessage,
  onSubmit,
}: {
  candidates: readonly AssignmentCandidate[];
  busy: boolean;
  actionLabel: (count: number) => string;
  emptyTitle?: string;
  submitErrorMessage?: string | null;
  onSubmit: (schoolIds: string[]) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [district, setDistrict] = useState("all");
  const [schoolType, setSchoolType] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectionNote, setSelectionNote] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(false);
  const processing = busy || submitting;
  const filtering = query !== deferredQuery;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const candidateIds = useMemo(() => new Set(candidates.map((school) => school.schoolId)), [candidates]);
  const selectedIds = useMemo(
    () => [...selected].filter((schoolId) => candidateIds.has(schoolId)),
    [candidateIds, selected],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const districtOptions = useMemo(
    () => [...new Set(candidates.map((school) => school.district))].sort((left, right) =>
      (DISTRICT_LABELS[left] ?? left).localeCompare(DISTRICT_LABELS[right] ?? right, "ko-KR")),
    [candidates],
  );
  const typeOptions = useMemo(
    () => [...new Set(candidates.map((school) => school.schoolType))].sort((left, right) =>
      (SCHOOL_TYPE_LABELS[left] ?? left).localeCompare(SCHOOL_TYPE_LABELS[right] ?? right, "ko-KR")),
    [candidates],
  );
  const filtered = useMemo(() => {
    const keyword = normalized(deferredQuery);
    return candidates.filter((school) => {
      if (district !== "all" && school.district !== district) return false;
      if (schoolType !== "all" && school.schoolType !== schoolType) return false;
      if (!keyword) return true;
      return normalized([
        school.name,
        school.address ?? "",
        DISTRICT_LABELS[school.district] ?? school.district,
        SCHOOL_TYPE_LABELS[school.schoolType] ?? school.schoolType,
      ].join(" ")).includes(keyword);
    });
  }, [candidates, deferredQuery, district, schoolType]);
  const selectedVisibleCount = filtered.reduce(
    (count, school) => count + (selectedIdSet.has(school.schoolId) ? 1 : 0),
    0,
  );
  const allVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const toggleSchool = (schoolId: string) => {
    if (processing || submittingRef.current) return;
    setSelectionNote(null);
    setSubmitError(null);
    if (!selectedIdSet.has(schoolId) && selectedIds.length >= MAX_BULK_ASSIGNMENT_COUNT) {
      setSelectionNote(`한 번에 최대 ${MAX_BULK_ASSIGNMENT_COUNT}곳까지 선택할 수 있습니다.`);
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      for (const id of next) if (!candidateIds.has(id)) next.delete(id);
      if (next.has(schoolId)) next.delete(schoolId);
      else next.add(schoolId);
      return next;
    });
  };

  const toggleFiltered = () => {
    if (processing || submittingRef.current || filtering) return;
    setSelectionNote(null);
    setSubmitError(null);
    const remainingCapacity = MAX_BULK_ASSIGNMENT_COUNT - selectedIds.length;
    if (!allVisibleSelected && filtered.length - selectedVisibleCount > remainingCapacity) {
      setSelectionNote(`안전한 일괄 처리를 위해 ${MAX_BULK_ASSIGNMENT_COUNT}곳까지만 선택했습니다.`);
    }
    setSelected((current) => {
      const next = new Set(current);
      for (const id of next) if (!candidateIds.has(id)) next.delete(id);
      if (allVisibleSelected) {
        for (const school of filtered) next.delete(school.schoolId);
        return next;
      }
      for (const school of filtered) {
        if (next.has(school.schoolId)) continue;
        if (next.size >= MAX_BULK_ASSIGNMENT_COUNT) break;
        next.add(school.schoolId);
      }
      return next;
    });
  };

  const submit = async () => {
    if (selectedIds.length === 0 || processing || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const completed = await onSubmit(selectedIds);
      if (mountedRef.current) {
        if (completed) {
          setSelected(new Set());
          setSelectionNote(null);
        } else {
          setSubmitError("처리를 완료하지 못했어요. 선택한 학교를 확인한 뒤 다시 시도해주세요.");
        }
      }
    } catch {
      if (mountedRef.current) setSubmitError("처리를 완료하지 못했어요. 선택한 학교를 확인한 뒤 다시 시도해주세요.");
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <section className="assignment-picker" aria-label="미배정 학교 다중 선택" aria-busy={processing}>
      <div className="assignment-picker__filters">
        <label className="assignment-picker__search">
          <span>학교 검색</span>
          <div>
            <Icon name="search" size={18} />
            <input
              {...searchInputProps}
              name="assignment-query"
              value={query}
              placeholder="학교명 또는 주소"
              disabled={processing}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </label>
        <label>
          <span>자치구</span>
          <select value={district} disabled={processing} onChange={(event) => setDistrict(event.target.value)}>
            <option value="all">전체 자치구</option>
            {districtOptions.map((value) => <option key={value} value={value}>{DISTRICT_LABELS[value] ?? value}</option>)}
          </select>
        </label>
        <label>
          <span>학교급</span>
          <select value={schoolType} disabled={processing} onChange={(event) => setSchoolType(event.target.value)}>
            <option value="all">전체 학교급</option>
            {typeOptions.map((value) => <option key={value} value={value}>{SCHOOL_TYPE_LABELS[value] ?? value}</option>)}
          </select>
        </label>
      </div>

      <div className="assignment-picker__selection-bar">
        <label>
          <MasterCheckbox
            checked={allVisibleSelected}
            indeterminate={someVisibleSelected}
            label={allVisibleSelected ? "검색 결과 선택 해제" : "검색 결과 전체 선택"}
            disabled={processing || filtering || filtered.length === 0}
            onChange={toggleFiltered}
          />
          <span aria-hidden="true"><Icon name="check" size={14} /></span>
          <strong>{allVisibleSelected ? "검색 결과 선택 해제" : `검색 결과 ${filtered.length}곳 전체 선택`}</strong>
        </label>
        <p role="status"><strong>{selectedIds.length}</strong>곳 선택 · 전체 미배정 {candidates.length}곳</p>
      </div>

      {selectionNote ? <p className="assignment-picker__note" role="status">{selectionNote}</p> : null}

      <div className="assignment-picker__list" role="group" aria-label={`학교 검색 결과 ${filtered.length}곳`} aria-busy={filtering}>
        {filtered.map((school) => {
          const checked = selectedIdSet.has(school.schoolId);
          return (
            <label key={school.schoolId} className="assignment-picker__row" data-selected={checked} data-disabled={processing}>
              <input type="checkbox" checked={checked} disabled={processing} onChange={() => toggleSchool(school.schoolId)} />
              <span className="assignment-picker__checkbox" aria-hidden="true"><Icon name="check" size={15} /></span>
              <span className="assignment-picker__school">
                <strong>{school.name}</strong>
                <small>{school.address ?? "주소 정보 없음"}</small>
              </span>
              <span className="assignment-picker__meta">
                <em>{DISTRICT_LABELS[school.district] ?? school.district}</em>
                <em>{SCHOOL_TYPE_LABELS[school.schoolType] ?? school.schoolType}</em>
              </span>
            </label>
          );
        })}
        {filtered.length === 0 ? (
          <div className="assignment-picker__empty">
            <Icon name="building" size={24} />
            <strong>{emptyTitle}</strong>
            <span>검색어나 필터를 바꿔보세요.</span>
          </div>
        ) : null}
      </div>

      <BottomSheetActions className="assignment-picker__commit" busy={processing}>
        {submitError ? <p className="assignment-picker__submit-error" role="alert">{submitErrorMessage?.trim() || submitError}</p> : null}
        <span className="assignment-picker__selected-count" role="status"><strong>{selectedIds.length}곳</strong> 선택</span>
        {selectedIds.length > 0 ? (
          <button className="assignment-picker__clear" type="button" disabled={processing} onClick={() => { if (!submittingRef.current) { setSelected(new Set()); setSubmitError(null); } }}>선택 해제</button>
        ) : null}
        <GlassButton variant="primary" disabled={selectedIds.length === 0 || processing} onClick={() => void submit()}>
          {processing ? "일괄 처리 중…" : actionLabel(selectedIds.length)}
        </GlassButton>
      </BottomSheetActions>
    </section>
  );
}
