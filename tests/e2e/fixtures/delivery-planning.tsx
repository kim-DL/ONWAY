import { useState } from "react";
import { createRoot } from "react-dom/client";
import DeliveryPlanningSheet from "../../../src/features/delivery-planning/delivery-planning-sheet";
import { type PlanningRepository } from "../../../src/features/delivery-planning/planning-repository";
import { DEFAULT_ORIGIN_ADDRESS, DEFAULT_DELIVERY_VEHICLE, PLANNING_NOTICE, type InvoiceResult, type PhotoBatchResult, type PhotoAlias, type PlanningSettings, type PlanningLists, type RouteRecommendation } from "../../../src/domain/delivery-planning";
import type { Customer } from "../../../src/domain/customer";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import DeliveryPhotoEditor from "../../../src/features/delivery-photos/delivery-photo-editor";
import { projectDeliveryPhotoCompletion } from "../../../src/features/delivery-photos/delivery-photo-domain";

const date = "2026-11-07"; const params = new URLSearchParams(location.search);
const names = [params.has("longRouteName") ? "주식회사아주긴학교급식식자재종합유통대전중앙물류사업부ABCDEFGHIJKLMN" : "예시푸드", "한빛유통", "늘봄식품", "푸른급식", "정다운푸드"];
const customers: Customer[] = names.map((name, i) => ({ customerId: `preview-${i}`, companyId: "onnuri", name, normalizedName: name, choseongName: name,
  district: "대덕구", administrativeDong: "예시동", officialAddress: `대전 대덕구 예시로 ${10 + i}`, deliveryAddress: `대전 대덕구 예시로 ${10 + i}`,
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "", deliveryPoint: { latitude: 36.3 + i / 100, longitude: 127.4 + i / 100 },
  contacts: [], status: "active", noticeType: "none", changeNote: "", revision: 1, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, createdBy: "preview", updatedBy: "preview" }));
let settings: PlanningSettings = { revision: 1, originAddress: DEFAULT_ORIGIN_ADDRESS, originPoint: params.has("unconfigured") ? null : { latitude: 36.3, longitude: 127.4 },
  vehicle: DEFAULT_DELIVERY_VEHICLE };
let lists: PlanningLists = { route: { employeeId: "preview", customerIds: customers.map((c) => c.customerId), revision: 1, updatedAt: `${date}T00:00:00Z`, updatedByEmployeeId: "preview" },
  day: { deliveryDateKey: date, customerIds: params.has("empty") ? [] : customers.map((c) => c.customerId), revision: 1, isOverride: true } };
const aliases: PhotoAlias[] = [];
const batches = new Map<string, PhotoBatchResult>();
const confirmReceipts = new Map<string, PhotoBatchResult>();
const confirmRequests: Parameters<PlanningRepository["confirmBatch"]>[0][] = [];
Object.assign(window, { batchPreviewStats: () => ({ confirmRequests, aliases }) });
const results = new Map<string, InvoiceResult>(); const recommendations = new Map<string, RouteRecommendation>();
let count = 0; let recommendCount = 0;
Object.assign(window, { planningPreviewStats: () => ({ recommendCount, analyzed: count }) });
const applyRequests: string[] = []; const receipts = new Map<string, PlanningLists["day"]>();
Object.assign(window, { planningApplyRequests: () => [...applyRequests] });
const recommendRequests: Parameters<PlanningRepository["recommend"]>[0][] = [];
Object.assign(window, { planningRecommendRequests: () => structuredClone(recommendRequests) });
const scanRequests: string[] = []; const scanGates: (() => void)[] = [];
let activeScans = 0; let maxActiveScans = 0;
Object.assign(window, {
  releasePreviewScan: () => scanGates.shift()?.(),
  previewScanStats: () => ({ requests: [...scanRequests], active: activeScans, maxActive: maxActiveScans }),
});
const register = (id: string) => { const ids = [...new Set([...lists.day.customerIds, id])]; lists = { ...lists, day: { ...lists.day, customerIds: ids, revision: (lists.day.revision ?? 0) + 1 } }; return lists; };
const analyzeFixtureInvoice = async ({ requestId }: Parameters<PlanningRepository["analyzeBatch"]>[0]) => {
    scanRequests.push(requestId); activeScans++; maxActiveScans = Math.max(maxActiveScans, activeScans);
    try {
    if (params.has("holdScans")) await new Promise<void>((resolve) => scanGates.push(resolve));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const old = results.get(requestId); if (old) return old;
    if (params.has("failScan") && scanRequests.length === 1) throw new Error("사진 분석을 다시 확인해주세요.");
    const index = count++ % customers.length; const c = customers[index]!; const review = params.has("review") && index === 1;
    const result: InvoiceResult = { scanId: requestId, fields: { recipientName: `${c.name}(대전)`, recipientAddress: c.officialAddress, invoiceDate: review ? "2026-11-09" : date, uncertain: review },
      status: review ? "review" : "saved", regionHint: "대전", customerId: review ? null : c.customerId, candidateIds: [c.customerId], reason: review ? "명세서 날짜를 확인해주세요." : "상호와 주소가 일치해 저장했어요.", elapsedMs: 7400 + index * 200,
      lists: review || params.has("batch") ? null : register(c.customerId) };
    results.set(requestId, result);
    if (params.has("lostScanResponse") && scanRequests.length === 1) throw new Error("저장 응답 확인 실패");
    return result;
    } finally { activeScans--; }
  };
const repository: PlanningRepository = {
  context: async () => ({ settings, canConfigure: true }),
  saveSettings: async ({ draft }) => { settings = { ...draft, vehicle: DEFAULT_DELIVERY_VEHICLE, revision: (settings.revision ?? 0) + 1 }; return settings; },
  analyzeBatch: async (input) => {
    const previous = batches.get(input.requestId); if (previous) { scanRequests.push(input.requestId); return previous; }
    const legacy = await analyzeFixtureInvoice(input);
    let rows: PhotoBatchResult["rows"] = [{ rowId: "row-1", rawName: legacy.fields.recipientName, address: legacy.fields.recipientAddress,
      date: legacy.fields.invoiceDate, dateUncertain: false, uncertain: legacy.fields.uncertain,
      dateStatus: legacy.fields.invoiceDate === date ? "current" : "different", status: legacy.status, customerId: legacy.customerId,
      candidateIds: legacy.candidateIds, reason: legacy.reason, matchSource: legacy.status === "saved" ? "invoice_address" : null, aliasRevision: null }];
    if (params.has("batch") && !params.has("unsupported")) {
      const alias = aliases.find((a) => a.aliasText === "한빛" && a.enabled);
      rows = [
        { rowId: "row-1", rawName: "예시푸드", address: "", date: null, dateUncertain: false, uncertain: false, dateStatus: "absent", status: "saved", customerId: "preview-0", candidateIds: ["preview-0"], reason: "상호가 일치해 저장했어요.", matchSource: "exact", aliasRevision: null },
        { rowId: "row-2", rawName: "한빛", address: "", date: null, dateUncertain: false, uncertain: false, dateStatus: "absent", status: alias ? "saved" : "review", customerId: alias?.customerId ?? null, candidateIds: ["preview-1"], reason: "거래처를 확인해주세요.", matchSource: alias ? "alias" : null, aliasRevision: alias?.revision ?? null },
        { rowId: "row-3", rawName: "늘봄?", address: "", date: null, dateUncertain: false, uncertain: true, dateStatus: "absent", status: "review", customerId: null, candidateIds: ["preview-2"], reason: "불확실한 글자가 있어요.", matchSource: null, aliasRevision: null },
      ];
      if (params.has("longName")) rows[2]!.rawName = "아주긴거래처이름을사진에서읽었지만정확한연결을확인해야해요";
      if (params.has("canonicalReview")) rows[1]!.rawName = "한빛유통";
      rows.filter((r) => r.customerId).forEach((r) => register(r.customerId!));
    }
    const result: PhotoBatchResult = params.has("unsupported")
      ? { scanId: input.requestId, revision: 1, kind: "unsupported", rows: [], dateConfirmed: false, message: "거래처를 읽지 못했어요. 명세서나 목록을 다시 촬영해주세요.", elapsedMs: legacy.elapsedMs, lists: null }
      : { scanId: input.requestId, revision: 1, kind: params.has("batch") ? "customer_list" : "invoice", rows, dateConfirmed: false, message: "", elapsedMs: legacy.elapsedMs, lists: legacy.lists || rows.some((r) => r.status === "saved") ? lists : null };
    batches.set(input.requestId, result); return result;
  },
  confirmBatch: async (input) => {
    confirmRequests.push(structuredClone(input));
    const receipt = confirmReceipts.get(input.requestId); if (receipt) return receipt;
    if (params.has("rejectedConfirm") && confirmRequests.length === 1) throw Object.assign(new Error("기억한 줄임말의 연결을 확인해주세요."), { code: "functions/failed-precondition" });
    const old = batches.get(input.scanId)!;
    if (old.revision !== input.expectedScanRevision) throw Object.assign(new Error("다시 확인해주세요."), { code: "aborted" });
    const rows = old.rows.map((row) => {
      const decision = input.decisions.find((d) => d.rowId === row.rowId); if (!decision) return row;
      if (decision.action === "skip") return { ...row, status: "skipped" as const };
      register(decision.customerId);
      if (decision.rememberAlias) {
        const existing = aliases.find((a) => a.aliasText === decision.aliasText);
        const customer = customers.find((c) => c.customerId === decision.customerId)!;
        const value: PhotoAlias = { aliasKey: existing?.aliasKey ?? String(aliases.length + 1).padStart(64, "0"), aliasText: decision.aliasText, customerId: customer.customerId, targetName: customer.name, revision: (existing?.revision ?? 0) + 1, enabled: true };
        if (existing) aliases.splice(aliases.indexOf(existing), 1, value); else aliases.push(value);
      }
      return { ...row, status: "saved" as const, customerId: decision.customerId, matchSource: "manual" as const };
    });
    const result: PhotoBatchResult = { ...old, revision: old.revision + 1, rows, dateConfirmed: old.dateConfirmed || input.dateConfirmed, lists };
    batches.set(input.scanId, result); confirmReceipts.set(input.requestId, result);
    if (params.has("lostConfirm") && confirmRequests.length === 1) throw new Error("저장 응답을 확인하지 못했어요. 저장 결과를 다시 확인해주세요.");
    return result;
  },
  aliases: async () => structuredClone(aliases),
  updateAlias: async ({ aliasKey, expectedRevision, customerId }) => {
    const index = aliases.findIndex((a) => a.aliasKey === aliasKey); const old = aliases[index]!;
    if (old.revision !== expectedRevision) throw Object.assign(new Error("줄임말이 바뀌었어요."), { code: "aborted" });
    const customer = customers.find((c) => c.customerId === customerId);
    const value: PhotoAlias = { ...old, customerId: customer?.customerId ?? old.customerId, targetName: customer?.name ?? old.targetName, enabled: Boolean(customerId), revision: old.revision + 1 };
    aliases[index] = value; return value;
  },
  recommend: async (input) => {
    const { requestId, lastCustomerId, firstCustomerId } = input;
    recommendRequests.push(structuredClone(input));
    if (firstCustomerId === lastCustomerId) throw new Error("출발지와 마지막 납품처를 다르게 선택해주세요.");
    recommendCount++; await new Promise((resolve) => setTimeout(resolve, 200));
    const result: RouteRecommendation = { recommendationId: requestId, deliveryDateKey: date, customerIds: [...(firstCustomerId ? [firstCustomerId] : []), ...lists.day.customerIds.filter((id) => id !== lastCustomerId && id !== firstCustomerId).reverse(), lastCustomerId],
      totalSeconds: 4920, totalMeters: 38400, calculatedAt: `${date}T00:00:00Z`, notice: PLANNING_NOTICE };
    recommendations.set(requestId, result); return result;
  },
  apply: async ({ recommendationId, requestId }) => {
    applyRequests.push(requestId);
    if (params.has("slowSave")) await new Promise((resolve) => setTimeout(resolve, 800));
    if (params.has("failSave") && applyRequests.length === 1) throw new Error("오늘 목록 저장 실패");
    const receipt = receipts.get(requestId); if (receipt) return receipt;
    lists = { ...lists, day: { ...lists.day, isOverride: true, customerIds: recommendations.get(recommendationId)!.customerIds, revision: (lists.day.revision ?? 0) + 1 } };
    receipts.set(requestId, lists.day);
    if (params.has("lostResponse") && applyRequests.length === 1) throw new Error("저장 응답 확인 실패");
    return lists.day;
  },
};
function Preview() {
  const [day, setDay] = useState(lists.day); const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"invoice" | "route">(params.has("route") ? "route" : "invoice");
  const [editing, setEditing] = useState(false);
  const session = { uid: "preview", claims: { sessionVersion: 1, permissionsVersion: 1 } } as AuthenticatedSession;
  const completion = projectDeliveryPhotoCompletion(day.customerIds, (id) => params.has("completed") && id === "preview-1" ? 1 : 0);
  return <main style={{ maxWidth: 600, margin: "0 auto", padding: "24px 20px", color: "#30475d" }}>
    <p style={{ fontSize: 12, background: "#e9eff5", padding: 12, borderRadius: 8 }}>로컬 미리보기 · 예시 거래처 / 모의 분석·경로 · 운영 데이터와 연결하지 않습니다.</p>
    <h1 style={{ fontSize: 24, fontWeight: 750, margin: "24px 0" }}>납품사진</h1>
    <button type="button" onClick={() => setOpen(true)} style={{ width: "100%", padding: 18, border: "1px solid #c0d0df", borderRadius: 12, background: "#eaf1f7", color: "#3d6387", fontWeight: 700 }}>사진으로 납품 준비</button>
    <h2 style={{ margin: "24px 0 8px" }}>오늘 남은 납품처 {completion.remainingCustomerIds.length}곳</h2><ol aria-label="오늘 남은 납품처">{completion.remainingCustomerIds.map((id) => <li key={id} style={{ padding: 16, borderBottom: "1px solid #d5dfe8" }}>{customers.find((c) => c.customerId === id)?.name}</li>)}</ol>
    {open && <DeliveryPlanningSheet mode={mode} customers={customers} day={day} repository={repository} onLists={(value) => setDay(value.day)} onDay={setDay} onRefresh={() => setDay(lists.day)} onClose={() => setOpen(false)}
      onEditToday={() => { setOpen(false); setEditing(true); }} />}
    {editing && <DeliveryPhotoEditor mode="day" session={session} customers={customers} initialIds={day.customerIds} revision={day.revision}
      onSave={async (ids, revision) => { if (revision !== lists.day.revision) return "conflict"; lists = { ...lists, day: { ...lists.day, customerIds: [...ids], revision: (revision ?? 0) + 1 } }; setDay(lists.day); return "saved"; }}
      onClose={() => { setEditing(false); setMode("route"); setOpen(true); }} />}
  </main>;
}
const root = createRoot(document.getElementById("root")!);
Object.assign(window, { unmountPlanningPreview: () => root.unmount() });
root.render(<Preview />);
