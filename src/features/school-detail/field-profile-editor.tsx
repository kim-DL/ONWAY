"use client";

import { useId, useState, type FormEvent } from "react";

import { BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import type { SchoolFieldProfile, SchoolFieldProfilePatch } from "@/domain/school";
import { formatNullablePhoneNumber } from "@/lib/phone-number";
import { profileSection, type EditorSection } from "./field-profile-patch";

function text(value: string | null) {
  return value ?? "";
}

function nullable(value: string) {
  return value.length > 0 ? value : null;
}

export function FieldProfileEditor({
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
