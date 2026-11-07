"use client";
import { useState } from "react";
import type { LocationCandidate } from "@/domain/customer";
import { planningSettingsDraftSchema, type PlanningSettings } from "@/domain/delivery-planning";
import { customerRepository } from "@/features/customers/customer-repository";
import { planningError, type PlanningRepository } from "./planning-repository";
import styles from "./planning.module.css";

export function PlanningSettingsForm({ settings, repository, onSaved, onCancel }: {
  settings: PlanningSettings; repository: PlanningRepository; onSaved: (value: PlanningSettings) => void; onCancel: () => void;
}) {
  const [address, setAddress] = useState(settings.originAddress);
  const [point, setPoint] = useState(settings.originPoint);
  const [places, setPlaces] = useState<LocationCandidate[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const search = async () => {
    setBusy(true); setError("");
    try { const found = await customerRepository.searchLocations(address); setPlaces(found); if (!found.length) setError("출발 위치를 찾지 못했어요. 도로명 주소로 검색해주세요."); }
    catch (e) { setError(planningError(e)); } finally { setBusy(false); }
  };
  const save = async () => {
    const parsed = planningSettingsDraftSchema.safeParse({ originAddress: address, originPoint: point });
    if (!parsed.success || !parsed.data.originPoint) { setError("회사 출발 위치를 선택해주세요."); return; }
    setBusy(true); setError("");
    try { onSaved(await repository.saveSettings({ requestId: crypto.randomUUID(), expectedRevision: settings.revision, draft: parsed.data })); }
    catch (e) { setError(planningError(e)); } finally { setBusy(false); }
  };
  return <section className={styles.settings} aria-label="회사 출발지 설정">
    <h3>회사 출발지</h3>
    <label>회사 주소<input value={address} disabled={busy} onChange={(e) => { setAddress(e.target.value); setPoint(null); setPlaces([]); }} /></label>
    <button type="button" disabled={busy || address.trim().length < 5} onClick={() => void search()}>출발 위치 검색</button>
    {places.length > 0 && <ul className={styles.candidates}>{places.map((place) => <li key={place.id}><button type="button" disabled={busy} onClick={() => { setAddress(place.address); setPoint(place.point); setPlaces([]); }}><strong>{place.name}</strong><small>{place.address}</small></button></li>)}</ul>}
    <p className={point ? styles.successText : styles.hint}>{point ? "출발 위치 선택됨" : "주소를 검색하고 실제 출발 위치를 선택해주세요."}</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.inlineActions}><button type="button" disabled={busy} onClick={onCancel}>돌아가기</button><button type="button" className={styles.primary} disabled={busy || !point} onClick={() => void save()}>{busy ? "확인 중…" : "출발지 저장"}</button></div>
  </section>;
}
