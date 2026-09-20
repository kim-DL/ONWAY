"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { OnnuriLoader } from "@/components/ui/onnuri-loader";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";
import { customerDraftSchema, type Customer, type CustomerContact, type CustomerDraft, type CustomerPoint, type LocationCandidate, type SaveCustomerInput } from "@/domain/customer";
import { formatPhoneNumber } from "@/lib/phone-number";

import { customerContactDisplayName, updateCustomerContactName } from "./customer-contact-name";
import { CustomerPhotoPicker } from "./customer-photo-picker";
import { customerPhotoErrorMessage, customerPhotoRepository, isCustomerPhotoStageError } from "./customer-photo-repository";
import { customerErrorMessage, customerRepository } from "./customer-repository";
import editorStyles from "./customer-editor.module.css";
import styles from "./customer.module.css";

const CustomerMap = dynamic(() => import("./customer-map").then((module) => module.CustomerMap), {
  loading: () => <div className={styles.mapLoading} role="status">지도를 준비하고 있어요.</div>,
});

function initialDraft(customer: Customer | null): CustomerDraft {
  // Keep legacy region metadata when editing; addresses and the actual delivery
  // point are the only location inputs in this editor.
  return customer ? {
    name: customer.name, district: customer.district, administrativeDong: customer.administrativeDong,
    officialAddress: customer.officialAddress, deliveryAddress: customer.deliveryAddress,
    accessPassword: customer.accessPassword, accessPasswordState: customer.accessPasswordState,
    deliveryLocationDescription: customer.deliveryLocationDescription, deliveryPoint: customer.deliveryPoint,
    contacts: customer.contacts.map((contact) => ({ ...contact })), status: customer.status,
    noticeType: customer.noticeType, changeNote: customer.changeNote,
  } : {
    name: "", district: "", administrativeDong: "", officialAddress: "", deliveryAddress: "",
    accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "", deliveryPoint: null,
    contacts: [], status: "active", noticeType: "new", changeNote: "",
  };
}

function parsePoint(latitude: string, longitude: string): CustomerPoint | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { latitude: lat, longitude: lng } : null;
}

function saveMayHaveCompleted(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return !["invalid-argument", "permission-denied", "unauthenticated", "failed-precondition", "not-found", "aborted", "resource-exhausted", "already-exists"].some((reason) => code.endsWith(reason));
}

export function CustomerEditor({ customer, onClose, onSaved, refreshMessage = "" }: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
  refreshMessage?: string;
}) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const active = useRef(true);
  const saving = useRef(false);
  const uncertainSave = useRef(false);
  const locationSequence = useRef(0);
  const requestId = useRef<string | null>(null);
  const uploadedPhoto = useRef<{ uploadId: string } | null>(null);
  const photoReading = useRef(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [photoSelection, setPhotoSelection] = useState<{ file: File; uploadId: string } | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saveStage, setSaveStage] = useState<"photo" | "customer">("customer");
  const [draft, setDraft] = useState(() => initialDraft(customer));
  const [latitude, setLatitude] = useState(() => customer?.deliveryPoint?.latitude.toString() ?? "");
  const [longitude, setLongitude] = useState(() => customer?.deliveryPoint?.longitude.toString() ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryOnly, setRetryOnly] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [locationResults, setLocationResults] = useState<LocationCandidate[]>([]);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [addressPending, setAddressPending] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [manualAddress, setManualAddress] = useState(Boolean(customer?.deliveryPoint && !customer.deliveryAddress));
  const [addressMessage, setAddressMessage] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; locationSequence.current += 1; };
  }, []);

  const changed = () => { setDirty(true); requestId.current = null; setError(""); setFieldErrors({}); };
  const changePhoto = (file: File | null) => {
    if (saving.current || uncertainSave.current) return;
    changed();
    uploadedPhoto.current = null;
    setPhotoSelection(file ? { file, uploadId: crypto.randomUUID() } : null);
    setPhotoRemoved(!file);
  };
  const update = <Key extends keyof CustomerDraft>(key: Key, value: CustomerDraft[Key]) => {
    if (saving.current || uncertainSave.current) return;
    changed();
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const close = () => {
    if (!busy && ((!dirty && !photoReading.current) || window.confirm(uncertainSave.current ? "저장되었을 수 있지만 결과를 확인하지 못했어요. 중복 등록을 피하려면 먼저 저장 결과를 다시 확인해주세요. 그래도 닫을까요?" : "저장하지 않은 변경사항이 있어요. 닫을까요?"))) onClose();
  };
  const updateContact = (id: string, key: keyof CustomerContact, value: string | boolean) => {
    if (saving.current || uncertainSave.current) return;
    changed();
    setDraft((current) => ({ ...current, contacts: current.contacts.map((contact) => contact.id === id ? key === "name" ? updateCustomerContactName(contact, String(value)) : { ...contact, [key]: value } : key === "isPrimary" ? { ...contact, isPrimary: false } : contact) }));
  };
  const removeContact = (id: string) => {
    if (saving.current || uncertainSave.current) return;
    changed();
    setDraft((current) => {
      const contacts = current.contacts.filter((contact) => contact.id !== id);
      if (contacts.length && !contacts.some((contact) => contact.isPrimary)) contacts[0] = { ...contacts[0]!, isPrimary: true };
      return { ...current, contacts };
    });
  };
  const changePoint = (point: CustomerPoint) => {
    if (saving.current || uncertainSave.current) return;
    changed();
    locationSequence.current += 1;
    setLocationResults([]);
    setLocationMessage("");
    setLocationBusy(false); setAddressBusy(false);
    setAddressPending(true); setManualAddress(false); setAddressMessage("");
    // A new pin must never inherit the previous point's address or region.
    setDraft((current) => ({ ...current, deliveryPoint: point, deliveryAddress: "", district: "", administrativeDong: "" }));
    setLatitude(point.latitude.toString());
    setLongitude(point.longitude.toString());
  };
  const setCoordinate = (axis: "latitude" | "longitude", value: string) => {
    if (saving.current || uncertainSave.current) return;
    changed();
    locationSequence.current += 1;
    setLocationResults([]); setLocationBusy(false); setAddressBusy(false);
    setAddressMessage(""); setManualAddress(false);
    if (axis === "latitude") setLatitude(value); else setLongitude(value);
    const point = parsePoint(axis === "latitude" ? value : latitude, axis === "longitude" ? value : longitude);
    setAddressPending(Boolean(point));
    setDraft((current) => ({ ...current, deliveryPoint: point, deliveryAddress: "", district: "", administrativeDong: "" }));
  };
  const findLocations = async () => {
    const query = draft.officialAddress.trim() || draft.name.trim();
    if (saving.current || uncertainSave.current || !query || locationBusy || addressBusy) return;
    if (query.length < 2) { setLocationMessage("주소나 상호를 두 글자 이상 입력해주세요."); return; }
    if (query.length > 200) { setLocationMessage("건물명이나 상세 안내를 빼고 도로명 주소로 검색해주세요."); return; }
    const sequence = ++locationSequence.current;
    setLocationBusy(true); setLocationResults([]); setLocationMessage("");
    try {
      const results = await customerRepository.searchLocations(query);
      if (!active.current || saving.current || sequence !== locationSequence.current) return;
      setLocationResults(results);
      setLocationMessage(results.length ? "주소를 선택하면 납품 위치도 함께 설정됩니다." : "검색 결과가 없어요. 도로명 주소로 다시 검색하거나 아래에서 좌표를 입력해주세요.");
    } catch (cause) {
      if (active.current && sequence === locationSequence.current) setLocationMessage(customerErrorMessage(cause));
    } finally { if (active.current && sequence === locationSequence.current) setLocationBusy(false); }
  };
  const selectLocation = (candidate: LocationCandidate) => {
    if (saving.current || uncertainSave.current) return;
    changed();
    const sequence = ++locationSequence.current;
    setLocationBusy(false); setAddressBusy(false);
    setAddressPending(!candidate.address.trim()); setManualAddress(false); setAddressMessage("");
    setDraft((current) => ({ ...current, officialAddress: candidate.address || current.officialAddress, deliveryPoint: candidate.point, deliveryAddress: candidate.address, district: "", administrativeDong: "" }));
    setLatitude(candidate.point.latitude.toString()); setLongitude(candidate.point.longitude.toString());
    setLocationResults([]);
    setLocationMessage("");
    // The place result already supplies a usable address. Region enrichment is
    // best effort: never hold up saving or replace that selected street address.
    void customerRepository.reverseLocation(candidate.point).then((result) => {
      if (!active.current || saving.current || uncertainSave.current || sequence !== locationSequence.current) return;
      requestId.current = null;
      setDraft((current) => ({ ...current, district: result.district.trim(), administrativeDong: result.administrativeDong.trim() }));
    }).catch(() => undefined);
  };
  const confirmLocation = async () => {
    const point = draft.deliveryPoint;
    if (!point || saving.current || uncertainSave.current || addressBusy || locationBusy) return;
    const sequence = ++locationSequence.current;
    setAddressBusy(true); setManualAddress(false); setAddressMessage("");
    try {
      const result = await customerRepository.reverseLocation(point);
      if (!active.current || saving.current || uncertainSave.current || sequence !== locationSequence.current) return;
      const address = result.address.trim();
      changed();
      setDraft((current) => ({ ...current, deliveryAddress: address, district: result.district.trim(), administrativeDong: result.administrativeDong.trim() }));
      setAddressPending(false);
      setManualAddress(!address);
      setAddressMessage(address ? "핀 위치의 주소가 설정되었어요." : "이 위치의 주소를 찾지 못했어요. 직접 보완하거나 주소 없이 위치만 저장할 수 있어요.");
    } catch (cause) {
      if (!active.current || saving.current || uncertainSave.current || sequence !== locationSequence.current) return;
      setAddressPending(false); setManualAddress(true);
      setAddressMessage(`${customerErrorMessage(cause)} 주소를 직접 보완하거나 위치만 저장할 수 있어요.`);
    } finally { if (active.current && sequence === locationSequence.current) setAddressBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || photoReading.current) return;
    const point = parsePoint(latitude, longitude);
    if ((latitude.trim() || longitude.trim()) && !point) {
      setError("위도와 경도를 모두 올바르게 입력해주세요.");
      setFieldErrors({ deliveryPoint: "위도 -90~90, 경도 -180~180 범위의 숫자를 입력해주세요." });
      setAdvancedOpen(true);
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[name="latitude"]')?.focus());
      return;
    }
    if (addressBusy || (point && addressPending)) {
      setError(addressBusy ? "납품 위치의 주소를 확인하고 있어요. 잠시 후 저장해주세요." : "옮긴 핀 아래의 ‘이 위치로 설정’을 눌러 납품 주소를 확인해주세요.");
      formRef.current?.querySelector<HTMLElement>('[data-confirm-delivery-point]')?.focus();
      return;
    }
    if (draft.accessPasswordState === "unknown") {
      setError("출입 비밀번호 등록 여부를 선택해주세요.");
      setFieldErrors({ accessPasswordState: "비밀번호 등록 또는 비밀번호 없음을 선택해주세요." });
      formRef.current?.querySelector<HTMLInputElement>('[data-customer-field="accessPasswordState"]')?.focus();
      return;
    }
    const parsed = customerDraftSchema.safeParse({ ...draft, deliveryPoint: point });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message;
      setFieldErrors(errors); setError("입력 내용을 확인해주세요.");
      const name = String(parsed.error.issues[0]?.path[0] ?? "name");
      formRef.current?.querySelector<HTMLElement>(`[data-customer-field="${name}"]`)?.focus();
      return;
    }
    // Ignore any location search still in flight and freeze this exact visible
    // snapshot and its retry ID before starting the save.
    saving.current = true;
    locationSequence.current += 1;
    setLocationBusy(false);
    setLocationMessage("");
    setBusy(true); setError("");
    requestId.current ??= crypto.randomUUID();
    let customerSaveStarted = false;
    try {
      let photoChange: SaveCustomerInput["photoChange"];
      if (photoSelection) {
        if (uploadedPhoto.current?.uploadId !== photoSelection.uploadId) {
          setSaveStage("photo");
          const result = await customerPhotoRepository.upload(photoSelection.file, photoSelection.uploadId);
          if (!active.current) return;
          uploadedPhoto.current = result;
        }
        photoChange = { action: "replace", uploadId: photoSelection.uploadId };
      } else if (photoRemoved) photoChange = { action: "remove" };
      setSaveStage("customer");
      customerSaveStarted = true;
      const result = await customerRepository.save({ requestId: requestId.current, customerId: customer?.customerId ?? null,
        expectedRevision: customer?.revision ?? null, draft: parsed.data, clearNotice: parsed.data.noticeType === "none", ...(photoChange ? { photoChange } : {}) });
      if (active.current) { setDirty(false); onSaved(result); }
    } catch (cause) {
      if (active.current) {
        const expiredPhoto = isCustomerPhotoStageError(cause);
        const uncertain = !expiredPhoto && customerSaveStarted && saveMayHaveCompleted(cause);
        uncertainSave.current = uncertain;
        setRetryOnly(uncertain);
        if (expiredPhoto && photoSelection) {
          // This typed rejection occurs before the customer transaction writes.
          // Keep the employee's file, but never retry its expired staged ID.
          uploadedPhoto.current = null;
          requestId.current = null;
          setPhotoSelection({ ...photoSelection, uploadId: crypto.randomUUID() });
        }
        setError(expiredPhoto ? "사진 연결이 만료되었어요. 사진을 다시 선택하거나 저장을 눌러 재업로드해주세요." : uncertain ? "저장 결과를 아직 확인하지 못했어요. 중복 등록을 막기 위해 같은 내용으로 다시 확인해주세요." : customerSaveStarted ? customerErrorMessage(cause) : customerPhotoErrorMessage(cause));
      }
    } finally { saving.current = false; if (active.current) setBusy(false); }
  };
  const textField = (label: string, key: "name" | "deliveryAddress", required = false) => <label className={styles.field}>
    <span>{label}{required ? <small>필수</small> : null}</span>
    <input name={key} data-customer-field={key} value={draft[key]} onChange={(event) => update(key, event.target.value)} required={required} maxLength={key.includes("Address") ? 500 : 120} autoComplete="off" aria-invalid={Boolean(fieldErrors[key])} />
    {fieldErrors[key] ? <small className={styles.fieldError}>{fieldErrors[key]}</small> : null}
  </label>;

  return <BottomSheet open title={customer ? "거래처 수정" : "거래처 등록"} onClose={onClose} dismissible={!busy} beforeClose={() => (!dirty && !photoReading.current) || window.confirm(uncertainSave.current ? "저장되었을 수 있지만 결과를 확인하지 못했어요. 중복 등록을 피하려면 먼저 저장 결과를 다시 확인해주세요. 그래도 닫을까요?" : "저장하지 않은 변경사항이 있어요. 닫을까요?")}>
    <form ref={formRef} id={formId} className={styles.editor} onSubmit={submit} autoComplete="off" noValidate data-customer-editor>
      {refreshMessage ? <p className={styles.warning} role="status">{refreshMessage}</p> : null}
      <fieldset disabled={busy || retryOnly} className={styles.editorFields}>
        <section className={styles.formSection} aria-labelledby={`${formId}-basic`}><h3 id={`${formId}-basic`}>기본 정보</h3>
          {textField("거래처명", "name", true)}
          <div className={styles.locationSearch}><label className={styles.field}><span>거래처 주소</span><input {...searchInputProps} name="delivery-location-query" data-customer-field="officialAddress" value={draft.officialAddress} onChange={(event) => { update("officialAddress", event.target.value); locationSequence.current += 1; setLocationResults([]); setLocationBusy(false); setAddressBusy(false); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void findLocations(); } }} maxLength={500} placeholder="도로명 주소 또는 상호로 검색" aria-invalid={Boolean(fieldErrors.officialAddress)} />{fieldErrors.officialAddress ? <small className={styles.fieldError}>{fieldErrors.officialAddress}</small> : null}</label><GlassButton compact disabled={locationBusy || addressBusy || !(draft.officialAddress.trim() || draft.name.trim())} onClick={() => void findLocations()}><Icon name="search" size={18} />{locationBusy ? "검색 중" : "검색"}</GlassButton></div>
          {locationMessage ? <p className={styles.hint} role="status">{locationMessage}</p> : null}
          {locationResults.length ? <ul className={styles.locationResults}>{locationResults.map((candidate) => <li key={candidate.id}><button type="button" onClick={() => selectLocation(candidate)}><strong>{candidate.name || candidate.address}</strong><span>{candidate.address}</span></button></li>)}</ul> : null}
          <CustomerPhotoPicker customer={customer} file={photoSelection?.file ?? null} removed={photoRemoved} disabled={busy || retryOnly} onChange={changePhoto} onReadingChange={(reading) => { photoReading.current = reading; setReadingPhoto(reading); }} />
        </section>
        <section className={styles.formSection} aria-labelledby={`${formId}-location`}><h3 id={`${formId}-location`}>납품 위치</h3>
          {draft.deliveryPoint ? <CustomerMap point={draft.deliveryPoint} name={draft.name || "거래처 납품지점"} editable={!busy && !retryOnly} onPointChange={changePoint} /> : <p className={styles.hint}>주소를 검색해 선택하면 지도가 표시됩니다.</p>}
          {draft.deliveryPoint || draft.deliveryAddress ? <div className={editorStyles.deliveryAddress} data-customer-delivery-address data-pending={addressPending}>
            <span className={editorStyles.addressIcon}><Icon name="location" size={20} /></span><div><span className={editorStyles.addressLabel}>실제 납품 주소</span><p>{addressPending ? "옮긴 핀의 주소를 확인해주세요." : draft.deliveryAddress || "주소 미등록 · 핀 위치로 안내"}</p></div>
            {addressPending || manualAddress ? <button type="button" className={editorStyles.confirmPoint} data-confirm-delivery-point disabled={addressBusy || locationBusy} onClick={() => void confirmLocation()}><Icon name={addressBusy ? "refresh" : "check"} size={17} />{addressBusy ? "주소 확인 중" : "이 위치로 설정"}</button> : <span className={editorStyles.confirmed}><Icon name="check" size={15} />{draft.deliveryPoint ? "설정됨" : "주소만 등록됨"}</span>}
          </div> : null}
          {addressMessage ? <p className={styles.hint} role="status">{addressMessage}</p> : null}
          {manualAddress ? textField("납품 주소 직접 보완 (선택)", "deliveryAddress") : null}
          <details className={editorStyles.advanced} open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary>좌표 직접 입력 · 위치 초기화<Icon name="chevron-right" size={16} /></summary>
            <div className={styles.twoColumns}><label className={styles.field}><span>위도</span><input name="latitude" data-customer-field="deliveryPoint" inputMode="decimal" value={latitude} onChange={(event) => setCoordinate("latitude", event.target.value)} aria-invalid={Boolean(fieldErrors.deliveryPoint)} /></label><label className={styles.field}><span>경도</span><input name="longitude" inputMode="decimal" value={longitude} onChange={(event) => setCoordinate("longitude", event.target.value)} aria-invalid={Boolean(fieldErrors.deliveryPoint)} /></label></div>
            {fieldErrors.deliveryPoint ? <p className={styles.fieldError}>{fieldErrors.deliveryPoint}</p> : null}
            {latitude || longitude ? <GlassButton compact variant="quiet" onClick={() => { changed(); locationSequence.current += 1; setLatitude(""); setLongitude(""); setDraft((current) => ({ ...current, deliveryPoint: null, deliveryAddress: "" })); setLocationResults([]); setLocationMessage(""); setAddressMessage(""); setAddressPending(false); setManualAddress(false); setLocationBusy(false); setAddressBusy(false); }}>등록된 위치 비우기</GlassButton> : null}
          </details>
        </section>
        <section className={styles.formSection} aria-labelledby={`${formId}-entry`}><h3 id={`${formId}-entry`}>출입 · 납품 안내</h3>
          <fieldset className={editorStyles.passwordChoice}><legend>출입 비밀번호 상태</legend><div>{(["registered", "none"] as const).map((state) => <label key={state} data-selected={draft.accessPasswordState === state}><input type="radio" name="customerPasswordState" data-customer-field={state === "registered" ? "accessPasswordState" : undefined} value={state} checked={draft.accessPasswordState === state} onChange={() => { changed(); setDraft((current) => ({ ...current, accessPasswordState: state, accessPassword: state === "registered" ? current.accessPassword : "" })); }} /><Icon name={state === "registered" ? "key" : "check"} size={18} /><span>{state === "registered" ? "비밀번호 등록" : "비밀번호 없음"}</span></label>)}</div>{draft.accessPasswordState === "unknown" ? <p className={styles.hint}>기존 정보가 미확인 상태예요. 등록 여부를 선택해주세요.</p> : null}{fieldErrors.accessPasswordState ? <p className={styles.fieldError}>{fieldErrors.accessPasswordState}</p> : null}</fieldset>
          {draft.accessPasswordState === "registered" ? <label className={styles.field}><span>출입 비밀번호<small>필수</small></span><input data-customer-field="accessPassword" type="text" value={draft.accessPassword} onChange={(event) => update("accessPassword", event.target.value)} autoComplete="off" spellCheck={false} maxLength={120} aria-invalid={Boolean(fieldErrors.accessPassword)} />{fieldErrors.accessPassword ? <small className={styles.fieldError}>{fieldErrors.accessPassword}</small> : null}</label> : null}
          <label className={styles.field}><span>납품 위치 설명</span><textarea data-customer-field="deliveryLocationDescription" rows={3} value={draft.deliveryLocationDescription} onChange={(event) => update("deliveryLocationDescription", event.target.value)} maxLength={2000} placeholder="예: 건물 뒤편, 좌측 두 번째 창고 셔터 앞" /></label>
        </section>
        <section className={styles.formSection} aria-labelledby={`${formId}-contacts`}><div className={styles.sectionHeading}><h3 id={`${formId}-contacts`}>연락처</h3><GlassButton compact disabled={draft.contacts.length >= 10} onClick={() => { changed(); setDraft((current) => ({ ...current, contacts: [...current.contacts, { id: crypto.randomUUID(), name: "", role: "", phoneNumber: "", isPrimary: current.contacts.length === 0 }] })); }}><Icon name="plus" size={17} />추가</GlassButton></div>
          {!draft.contacts.length ? <p className={styles.hint}>등록된 연락처가 없습니다.</p> : null}
          {draft.contacts.map((contact, index) => <fieldset className={styles.contactEditor} key={contact.id}><legend>연락처 {index + 1}</legend><div className={styles.contactEditorHeading}><label className={styles.radioLabel}><input type="radio" name="primaryContact" checked={contact.isPrimary} onChange={() => updateContact(contact.id, "isPrimary", true)} />대표 연락처</label><button type="button" className={styles.iconButton} aria-label={`연락처 ${index + 1} 삭제`} onClick={() => removeContact(contact.id)}><Icon name="close" size={18} /></button></div><label className={styles.field}><span>이름</span><input value={customerContactDisplayName(contact)} onChange={(event) => updateContact(contact.id, "name", event.target.value)} maxLength={241} placeholder="예: 소은 부장, 소은 사장" autoComplete="off" /></label><label className={styles.field}><span>전화번호</span><input type="tel" inputMode="tel" data-customer-field="contacts" value={contact.phoneNumber} onChange={(event) => updateContact(contact.id, "phoneNumber", event.target.value)} onBlur={(event) => { const formatted = formatPhoneNumber(event.currentTarget.value); if (formatted !== contact.phoneNumber) updateContact(contact.id, "phoneNumber", formatted); }} maxLength={30} placeholder="010-0000-0000" autoComplete="off" /></label></fieldset>)}
          {fieldErrors.contacts ? <p className={styles.fieldError}>{fieldErrors.contacts}</p> : null}
        </section>
        <section className={styles.formSection} aria-labelledby={`${formId}-status`}><h3 id={`${formId}-status`}>상태 · 변경 안내</h3><div className={styles.twoColumns}>
          <label className={styles.field}><span>영업 상태</span><select value={draft.status} onChange={(event) => update("status", event.target.value as CustomerDraft["status"])}><option value="active">거래중</option><option value="closed">폐업</option></select></label>
          <label className={styles.field}><span id={`${formId}-notice-label`}>주의 배지</span><select aria-labelledby={`${formId}-notice-label`} value={draft.noticeType} onChange={(event) => update("noticeType", event.target.value as CustomerDraft["noticeType"])}><option value="new">신규</option><option value="changed">정보변경</option><option value="none">없음</option></select></label></div>
          <p className={styles.hint}>‘없음’을 선택하면 신규·정보변경 배지가 표시되지 않아요.</p>
          {draft.status === "closed" ? <p className={styles.warning}>폐업 후에도 검색과 기존 정보는 유지됩니다.</p> : null}
          <label className={styles.field}><span>변경 안내 메모</span><textarea rows={2} value={draft.changeNote} onChange={(event) => update("changeNote", event.target.value)} maxLength={1000} placeholder="직원에게 알려야 할 변경 내용을 적어주세요." /></label>
        </section>
      </fieldset>
      <BottomSheetActions busy={busy} className={styles.saveActions ?? ""}>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <GlassButton disabled={busy} onClick={close}>취소</GlassButton><GlassButton form={formId} type="submit" variant="primary" disabled={busy || readingPhoto}>{busy || readingPhoto ? <OnnuriLoader size="small" tone="inherit" decorative /> : null}{readingPhoto ? "사진 가져오는 중…" : busy ? saveStage === "photo" ? "사진 저장 중…" : "저장 중…" : retryOnly ? "저장 결과 다시 확인" : "거래처 저장"}</GlassButton>
      </BottomSheetActions>
    </form>
  </BottomSheet>;
}
