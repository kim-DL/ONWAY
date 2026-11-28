import { GlassButton } from "@/components/ui/glass-button";
import type { ScanEditor } from "./editor-types";
import { editorValue, sameText, scanFieldLabels, type Suggestion } from "./review-model";
import styles from "./review.module.css";

export function SuggestedFields({ suggestions, editor }: { suggestions: Suggestion[]; editor: ScanEditor }) {
  if (!suggestions.length) return null;
  const grouped = new Map<string, Suggestion>();
  for (const item of suggestions) {
    const key = [item.field, item.value, item.unit].join("|");
    const earlier = grouped.get(key);
    grouped.set(key, earlier ? { ...item, source: [...new Set([...earlier.source.split(" + "), item.source])].join(" + ") } : item);
  }
  const conflicts = (["expiry", "origin"] as const).filter(field =>
    new Set(suggestions.filter(item => item.field === field).map(item => item.value)).size > 1);
  return <div className={styles.fields}>{conflicts.length > 0 && <small role="status">{conflicts.map(field => scanFieldLabels[field]).join(" · ")} 표시가 사진마다 달라요. 이번 제품의 값을 확인해 주세요.</small>}{[...grouped.values()].map(item => {
    const current = editorValue(item.field, editor.draft, editor.lot);
    const wrongUnit = item.field === "boxPackSize" && !sameText(item.unit ?? "", editor.draft.unitLabel);
    const applied = !wrongUnit && sameText(current, item.value);
    return <div className={styles.field} key={[item.field, item.value, item.unit].join("|")}>
      <div><small>{scanFieldLabels[item.field]} · {item.source}</small><strong>{item.value}{item.unit}</strong>
        {item.evidence !== item.value && <span>{item.evidence}</span>}
        {wrongUnit && <span>아래 기준 단위를 ‘{item.unit}’로 선택하면 적용할 수 있어요.</span>}</div>
      {applied ? <span className={styles.applied}>반영됨</span> : <GlassButton compact disabled={wrongUnit || editor.busy}
        aria-label={scanFieldLabels[item.field] + " " + item.value + " 확인"} onClick={() => editor.apply(item, true)}>
        {item.field === "manufacturer" ? "목록 확인" : "적용"}</GlassButton>}
    </div>;
  })}</div>;
}
