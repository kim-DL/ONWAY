"use client";

import { useEffect, useId, useState } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { INVENTORY_LOCATIONS, INVENTORY_LOCATION_LABELS } from "@/domain/inventory";
import { locationAssignmentsSchema, locationRosterSchema, type LocationRoster } from "../../../functions/src/inventory/inventory-location-contract";
import { callInventory, inventoryErrorMessage } from "./inventory-repository";
import { useInventoryAction } from "./inventory-forms";
import styles from "./inventory.module.css";

export default function InventoryLocationSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const action = useInventoryAction();
  const [roster, setRoster] = useState<LocationRoster | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void callInventory("getInventoryLocationAssignments", {}, locationRosterSchema).then(result => {
      if (alive) setRoster(result);
    }).catch(cause => { if (alive) setError(inventoryErrorMessage(cause)); });
    return () => { alive = false; };
  }, [attempt]);

  function reload() { setRoster(null); setError(""); setAttempt(value => value + 1); }
  return <BottomSheet open title="보관 장소 담당자" onClose={onClose} dismissible={!action.busy}>
    <form className={styles.sheet} id={id} onSubmit={event => {
      event.preventDefault();
      if (!roster) return;
      const input = { expectedRevision: roster.revision, owners: roster.owners };
      void action.run(input, (requestId) => callInventory("setInventoryLocationAssignments", { ...input, requestId }, locationAssignmentsSchema), onSaved);
    }}>
      <p className={styles.muted}>직원이 스캔하면 담당 장소가 먼저 선택돼요. 입고할 때 다른 장소로 바꿀 수 있어요.</p>
      {roster && INVENTORY_LOCATIONS.map(location => {
        const owner = roster.owners[location];
        return <label key={location} className={styles.field}>{INVENTORY_LOCATION_LABELS[location]} 담당자
          <select value={owner ?? ""} disabled={action.busy} onChange={event => {
            setRoster({ ...roster, owners: { ...roster.owners, [location]: event.target.value || null } });
          }}>
            <option value="">미지정</option>
            {owner && !roster.staff.some(person => person.employeeId === owner) && <option value={owner} disabled>이전 담당자 · 재지정 가능</option>}
            {roster.staff.map(person => <option value={person.employeeId} key={person.employeeId}>{person.displayName}{roster.staff.some(other => other.employeeId !== person.employeeId && other.displayName === person.displayName) ? " · " + person.employeeId : ""}</option>)}
          </select></label>;
      })}
      {!roster && !error && <p role="status">담당자 목록을 불러오는 중…</p>}
      {(error || action.error) && <div role="alert" className={styles.error}>{error || "담당자 설정을 저장하지 못했어요. 최신 배정을 확인해주세요."}
        <GlassButton compact onClick={reload}>최신 배정 불러오기</GlassButton></div>}
    </form>
    <BottomSheetActions busy={action.busy}><GlassButton onClick={onClose}>취소</GlassButton>
      <GlassButton variant="primary" type="submit" form={id} disabled={!roster || !action.online || action.busy}>담당자 저장</GlassButton></BottomSheetActions>
  </BottomSheet>;
}
