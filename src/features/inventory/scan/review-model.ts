import type { InventoryProduct, InventoryProductDraft, InventoryLotDraft } from "@/domain/inventory";
import type { LabelReading, ScanField } from "@/domain/inventory-scan";

export type Suggestion = {
  field: ScanField; value: string; evidence: string; source: string; unit?: string;
  net?: string; inner?: string; replaces?: string;
};
export const scanFieldLabels: Record<ScanField, string> = {
  name: "품목명", manufacturer: "제조사", origin: "원산지", specification: "규격", boxPackSize: "박스 입수", expiry: "이번 입고 소비·유통기한",
};
export const sameText = (a: string, b: string) => a.normalize("NFKC").replace(/\s/g, "").toLocaleLowerCase("ko") === b.normalize("NFKC").replace(/\s/g, "").toLocaleLowerCase("ko");
export function labelSuggestions(reading: LabelReading, source: string): Suggestion[] {
  if (reading.kind !== "single") return [];
  const result: Suggestion[] = [];
  for (const field of ["name", "manufacturer", "origin", "expiry"] as const) {
    const item = reading[field];
    if (item) result.push({ field, value: item.value, evidence: item.quote, source });
  }
  const spec = [reading.netContent, reading.innerContents].filter(item => item !== null);
  const combined = [...new Set(spec.map(item => item.value))].join(" · ");
  if (spec.length) result.push({ field: "specification", value: combined.length <= 200 ? combined : spec[0]!.value,
    evidence: [...new Set(spec.map(item => item.quote))].join(" / "), source,
    ...(reading.netContent ? { net: reading.netContent.value } : {}), ...(reading.innerContents ? { inner: reading.innerContents.value } : {}) });
  const pack = reading.casePack;
  if (pack) result.push({ field: "boxPackSize", value: String(pack.count), unit: pack.unit, evidence: pack.quote, source });
  return result;
}
export function supplementSpecification(previous: Suggestion[], next: Suggestion): Suggestion {
  if (next.field !== "specification") return next;
  const prior = previous.findLast(item => item.field === "specification"
    && (!item.net || !next.net || sameText(item.net, next.net))
    && (!item.inner || !next.inner || sameText(item.inner, next.inner))
    && ((!item.net && !!next.net) || (!item.inner && !!next.inner)));
  if (!prior) return next;
  const net = next.net ?? prior.net;
  const inner = next.inner ?? prior.inner;
  const value = [net, inner].filter(Boolean).join(" · ");
  if (value.length > 200) return next;
  return { ...next, value, ...(net ? { net } : {}), ...(inner ? { inner } : {}), replaces: prior.value,
    source: [prior.source, next.source].join(" + "), evidence: [...new Set([prior.evidence, next.evidence])].join(" / ") };
}
export function editorValue(field: ScanField, draft: InventoryProductDraft, lot: InventoryLotDraft): string {
  return field === "expiry" ? lot.expiryState === "dated" ? lot.expiryDate ?? "" : "미확인" : String(draft[field] ?? "");
}
export function autoFillAllowed(s: Suggestion, current: string, touched: boolean) {
  return !touched && (!current || (!!s.replaces && sameText(current, s.replaces))) && ["name", "origin", "specification", "expiry"].includes(s.field);
}
export function similarProducts(products: InventoryProduct[], name: string) {
  const key = name.normalize("NFKC").replace(/\s/g, "").toLocaleLowerCase("ko");
  if (key.length < 2) return [];
  return products.filter(p => p.status === "active" && p.name.normalize("NFKC").replace(/\s/g, "").toLocaleLowerCase("ko").includes(key))
    .sort((a, b) => Number(sameText(b.name, name)) - Number(sameText(a.name, name))).slice(0, 5);
}
