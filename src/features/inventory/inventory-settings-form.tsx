import { useId, useState } from "react";
import type { InventoryContext } from "@/domain/inventory";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { FormFooter, useInventoryAction } from "./inventory-forms";
import { inventoryRepository } from "./inventory-repository";
import InventoryLocationSettings from "./inventory-location-settings";
import styles from "./inventory.module.css";

export default function InventorySettingsForm({ context, onClose, onSaved, onAssignmentsSaved }: { context: InventoryContext; onClose: () => void; onSaved: () => void; onAssignmentsSaved?: () => void }) {
  const [ownersOpen, setOwnersOpen] = useState(false);
  const id = useId(); const action = useInventoryAction(); const [weekday, setWeekday] = useState(context.settings.pendingWeekday ?? context.settings.weekday); const [urgentDays, setUrgentDays] = useState(context.settings.urgentDays);
  if (ownersOpen) return <InventoryLocationSettings onClose={() => setOwnersOpen(false)} onSaved={() => { setOwnersOpen(false); onAssignmentsSaved?.(); }} />;
  return <BottomSheet open title="재고 관리 설정" onClose={onClose} dismissible={!action.busy}><form id={id} className={styles.sheet} onSubmit={(event) => { event.preventDefault(); const input = { expectedRevision: context.settings.revision, weekday, urgentDays }; void action.run(input, (requestId) => inventoryRepository.settings({ ...input, requestId }), onSaved); }}><GlassButton onClick={() => setOwnersOpen(true)} disabled={action.busy}>보관 장소 담당자</GlassButton><label className={styles.field}>매주 실사 시작 요일<select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))} disabled={action.busy}>{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <option key={day} value={index}>{day}요일</option>)}</select></label><p className={styles.muted}>요일 변경은 현재 실사 기간이 끝난 뒤 적용돼요. 이미 확인한 기록은 초기화하지 않아요.{context.settings.effectiveDate ? ` 적용 예정일 ${context.settings.effectiveDate}` : ""}</p><label className={styles.field}>유통기한 임박 기준 (일 이내)<input type="number" inputMode="numeric" required min={0} max={365} step={1} value={Number.isNaN(urgentDays) ? "" : urgentDays} onChange={(event) => setUrgentDays(event.target.valueAsNumber)} disabled={action.busy} /></label>{action.error ? <p className={styles.error} role="alert">{action.error}</p> : null}</form><FormFooter id={id} busy={action.busy} onClose={onClose} label="설정 저장" /></BottomSheet>;
}
