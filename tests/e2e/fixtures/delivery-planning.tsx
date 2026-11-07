import { useState } from "react";
import { createRoot } from "react-dom/client";
import DeliveryPlanningSheet from "../../../src/features/delivery-planning/delivery-planning-sheet";
import { type PlanningRepository } from "../../../src/features/delivery-planning/planning-repository";
import { DEFAULT_ORIGIN_ADDRESS, DEFAULT_DELIVERY_VEHICLE, PLANNING_NOTICE, type InvoiceResult, type PlanningSettings, type PlanningLists, type RouteRecommendation } from "../../../src/domain/delivery-planning";
import type { Customer } from "../../../src/domain/customer";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import DeliveryPhotoEditor from "../../../src/features/delivery-photos/delivery-photo-editor";
import { projectDeliveryPhotoCompletion } from "../../../src/features/delivery-photos/delivery-photo-domain";

const date = "2026-11-07"; const params = new URLSearchParams(location.search);
const names = ["예시푸드", "한빛유통", "늘봄식품", "푸른급식", "정다운푸드"];
const customers: Customer[] = names.map((name, i) => ({ customerId: `preview-${i}`, companyId: "onnuri", name, normalizedName: name, choseongName: name,
  district: "대덕구", administrativeDong: "예시동", officialAddress: `대전 대덕구 예시로 ${10 + i}`, deliveryAddress: `대전 대덕구 예시로 ${10 + i}`,
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "", deliveryPoint: { latitude: 36.3 + i / 100, longitude: 127.4 + i / 100 },
  contacts: [], status: "active", noticeType: "none", changeNote: "", revision: 1, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, createdBy: "preview", updatedBy: "preview" }));
let settings: PlanningSettings = { revision: 1, originAddress: DEFAULT_ORIGIN_ADDRESS, originPoint: params.has("unconfigured") ? null : { latitude: 36.3, longitude: 127.4 },
  vehicle: DEFAULT_DELIVERY_VEHICLE };
let lists: PlanningLists = { route: { employeeId: "preview", customerIds: customers.map((c) => c.customerId), revision: 1, updatedAt: `${date}T00:00:00Z`, updatedByEmployeeId: "preview" },
  day: { deliveryDateKey: date, customerIds: params.has("empty") ? [] : customers.map((c) => c.customerId), revision: 1, isOverride: true } };
const results = new Map<string, InvoiceResult>(); const recommendations = new Map<string, RouteRecommendation>();
let count = 0; let recommendCount = 0;
Object.assign(window, { planningPreviewStats: () => ({ recommendCount, analyzed: count }) });
const applyRequests: string[] = []; const receipts = new Map<string, PlanningLists["day"]>();
Object.assign(window, { planningApplyRequests: () => [...applyRequests] });
const register = (id: string) => { const ids = [...new Set([...lists.day.customerIds, id])]; lists = { ...lists, day: { ...lists.day, customerIds: ids, revision: (lists.day.revision ?? 0) + 1 } }; return lists; };
const repository: PlanningRepository = {
  context: async () => ({ settings, canConfigure: true }),
  saveSettings: async ({ draft }) => { settings = { ...draft, vehicle: DEFAULT_DELIVERY_VEHICLE, revision: (settings.revision ?? 0) + 1 }; return settings; },
  analyze: async ({ requestId }) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const old = results.get(requestId); if (old) return old;
    const index = count++ % customers.length; const c = customers[index]!; const review = params.has("review") && index === 1;
    const result: InvoiceResult = { scanId: requestId, fields: { recipientName: `${c.name}(대전)`, recipientAddress: c.officialAddress, invoiceDate: review ? "2026-11-09" : date, uncertain: review },
      status: review ? "review" : "saved", regionHint: "대전", customerId: review ? null : c.customerId, candidateIds: [c.customerId], reason: review ? "명세서 날짜를 확인해주세요." : "상호와 주소가 일치해 저장했어요.", elapsedMs: 7400 + index * 200,
      lists: review ? null : register(c.customerId) };
    results.set(requestId, result); return result;
  },
  confirm: async ({ scanId, customerId }) => { const result: InvoiceResult = { ...results.get(scanId)!, status: "saved", customerId, lists: register(customerId) }; results.set(scanId, result); return result; },
  recommend: async ({ requestId, lastCustomerId }) => {
    recommendCount++; await new Promise((resolve) => setTimeout(resolve, 200));
    const result: RouteRecommendation = { recommendationId: requestId, deliveryDateKey: date, customerIds: [...lists.day.customerIds.filter((id) => id !== lastCustomerId).reverse(), lastCustomerId],
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
    <button type="button" onClick={() => setOpen(true)} style={{ width: "100%", padding: 18, border: "1px solid #c0d0df", borderRadius: 12, background: "#eaf1f7", color: "#3d6387", fontWeight: 700 }}>명세서로 납품 준비</button>
    <h2 style={{ margin: "24px 0 8px" }}>오늘 남은 납품처 {completion.remainingCustomerIds.length}곳</h2><ol aria-label="오늘 남은 납품처">{completion.remainingCustomerIds.map((id) => <li key={id} style={{ padding: 16, borderBottom: "1px solid #d5dfe8" }}>{customers.find((c) => c.customerId === id)?.name}</li>)}</ol>
    {open && <DeliveryPlanningSheet mode={mode} customers={customers} day={day} repository={repository} onLists={(value) => setDay(value.day)} onDay={setDay} onRefresh={() => setDay(lists.day)} onClose={() => setOpen(false)}
      onEditToday={() => { setOpen(false); setEditing(true); }} />}
    {editing && <DeliveryPhotoEditor mode="day" session={session} customers={customers} initialIds={day.customerIds} revision={day.revision}
      onSave={async (ids, revision) => { if (revision !== lists.day.revision) return "conflict"; lists = { ...lists, day: { ...lists.day, customerIds: [...ids], revision: (revision ?? 0) + 1 } }; setDay(lists.day); return "saved"; }}
      onClose={() => { setEditing(false); setMode("route"); setOpen(true); }} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
