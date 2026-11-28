import { useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import type { InventoryProduct } from "@/domain/inventory";
import { canonicalGtin, scanBarcodesSchema, type BarcodeMatch, type FoodCandidate, type ScanBarcodeLink } from "@/domain/inventory-scan";
import { similarProducts } from "./review-model";
import styles from "./review.module.css";

export function BarcodeReview({ code, match, links, disabled, onLinks, onIgnore, onExisting }: {
  code: string; match: BarcodeMatch; links: ScanBarcodeLink[]; disabled: boolean;
  onLinks: (links: ScanBarcodeLink[]) => void; onIgnore: () => void; onExisting: (id: string) => void;
}) {
  const canonical = canonicalGtin(code);
  const linked = links.find(link => link.code === canonical);
  const others = links.filter(link => link.code !== canonical);
  return <div className={styles.group}><small>읽은 바코드</small><strong className={styles.code}>{code}</strong>
    {match.status === "matched" ? <><strong>{match.name}</strong><span>급식길에 연결된 {match.level === "case" ? "박스" : "낱개 포장"} 바코드예요.</span>
      <GlassButton onClick={() => onExisting(match.productId)} disabled={disabled}>이 품목 입고하기</GlassButton></>
    : match.status === "inactive" ? <span>사용이 중지된 품목에 연결된 번호예요. 다른 바코드를 확인해주세요.</span>
    : <label>바코드 연결<select aria-label="바코드 포장 단위" disabled={disabled || others.length >= 3} value={linked?.level ?? ""}
      onChange={event => onLinks(event.target.value ? scanBarcodesSchema.parse([...others, { code, level: event.target.value }]) : others)}>
      <option value="">연결하지 않음</option><option value="unit">기준 단위 포장에 연결</option><option value="case">박스에 연결</option>
    </select></label>}
    <button type="button" className={styles.textButton} disabled={disabled} onClick={() => { onLinks(others); onIgnore(); }}>이 바코드 제외</button></div>;
}
export function FoodResults({ data, onPick }: { data: { status: string; items: FoodCandidate[]; more: boolean }; onPick: (item: FoodCandidate) => void }) {
  return <div className={styles.group}><small>식품안전나라 제품 후보</small>
    {data.items.map(item => <button type="button" key={item.reportNo} className={styles.choice} onClick={() => onPick(item)}>
      <strong>{item.name}</strong><span>{[item.manufacturer, item.category, item.reportNo].filter(Boolean).join(" · ")}</span></button>)}
    {data.status === "unconfigured" ? <span>식품안전나라 조회 설정이 필요해요. 사진이나 직접 입력으로 계속할 수 있어요.</span>
    : data.status === "unavailable" ? <span>식품안전나라에 연결하지 못했어요. 잠시 뒤 다시 조회할 수 있어요.</span>
    : !data.items.length ? <span>표시할 제품 후보가 없어요.</span> : null}
    {data.more && <span>검색 결과가 더 있어요. 정확한 제품명으로 좁혀주세요.</span>}
  </div>;
}
export function InternalMatches({ products, name, linked, onExisting }: {
  products: InventoryProduct[]; name: string; linked: boolean; onExisting: (id: string) => void;
}) {
  const [search, setSearch] = useState<string | null>(null);
  const items = similarProducts(products, search ?? name);
  return <details className={styles.matches} key={linked ? "link" : "find"} open={items.length > 0 || search !== null || undefined}>
    <summary>급식길 기존 품목 찾기{items.length > 0 ? " · " + items.length + "개" : ""}</summary>
    <input aria-label="기존 품목명 검색" value={search ?? name} maxLength={100} placeholder="품목명 두 글자 이상" onChange={event => setSearch(event.target.value)} />
    {items.map(p => <button type="button" key={p.productId} className={styles.choice} onClick={() => onExisting(p.productId)}>
      <strong>{p.name}</strong><span>{[p.manufacturer, p.specification, linked ? "바코드 확인 · 입고" : "입고하기"].filter(Boolean).join(" · ")}</span></button>)}
  </details>;
}
