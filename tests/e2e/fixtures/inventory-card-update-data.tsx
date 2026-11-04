import { useEffect } from "react";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { inventoryLocationMap, inventoryProductSchema, type InventoryContext, type InventoryProduct } from "../../../src/domain/inventory";
import { inventoryKoreaDate } from "../../../src/features/inventory/inventory-calendar";

export type CardUpdateMeasurement = { cardRenders: number; domCommittedMs: number; nextFrameMs: number; quantity: number; stockRevision: number };
export type CardUpdateMetrics = { cardRenders: number; completed: number; samples: CardUpdateMeasurement[]; pending: null | { startedAt: number; quantity: number; stockRevision: number } };
declare global { var __inventoryCardMetrics: CardUpdateMetrics; }
globalThis.__inventoryCardMetrics = { cardRenders: 0, completed: 0, samples: [], pending: null };

const count = Number(new URLSearchParams(location.search).get("count") ?? 60);
if (![60, 300].includes(count)) throw new Error("Unsupported synthetic catalog size");
export const session = { uid: "inventory-card-update-fixture", displayName: "가상 직원", claims: {
  employeeId: "SYNTHETIC", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1,
} } as AuthenticatedSession;
export const context: InventoryContext = {
  today: inventoryKoreaDate(), canWrite: true, canAdmin: false,
  cycle: { cycleId: "synthetic-cycle", startDate: "2026-01-01", nextDate: "2099-01-01", weekday: 1 },
  settings: { urgentDays: 7, weekday: 1, revision: 1, pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null },
};
export const products = Array.from({ length: count }, (_, index) => inventoryProductSchema.parse({
  productId: `synthetic-${index}`, companyId: "onnuri", name: `가상 품목 ${String(index + 1).padStart(4, "0")}`,
  manufacturer: "가상 제조사", specification: "1kg", origin: "대한민국", note: "합성 측정 데이터", unitLabel: "봉", unitsPerBox: 1,
  defaultLocationId: "refrigerated", status: "active", urgent: false, revision: 1, stockRevision: 1, hasHistory: true,
  quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 1 }, nearestExpiryByLocation: inventoryLocationMap("2027-01-01"),
  lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  createdBy: "SYNTHETIC", updatedBy: "SYNTHETIC",
}));
export const inventoryRepository = { context: async () => context, list: async () => products };
export const inventoryErrorMessage = () => "Synthetic fixture failure";

export function InventoryDetail({ initialProduct, onSaved, onClose }: {
  initialProduct: InventoryProduct; onSaved: (product: InventoryProduct) => void; onClose: () => void;
}) {
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const metrics = globalThis.__inventoryCardMetrics;
      const pending = metrics.pending;
      if (!pending) return;
      const label = `${initialProduct.name}, ${pending.quantity} 봉, 상세 보기`;
      if (!document.querySelector(`button[aria-label="${label}"]`)) return;
      metrics.pending = null;
      const sample = { cardRenders: metrics.cardRenders, domCommittedMs: performance.now() - pending.startedAt,
        nextFrameMs: 0, quantity: pending.quantity, stockRevision: pending.stockRevision };
      requestAnimationFrame(() => {
        sample.nextFrameMs = performance.now() - pending.startedAt;
        metrics.samples.push(sample);
        metrics.completed += 1;
      });
    });
    observer.observe(document.getElementById("root")!, { subtree: true, attributes: true, childList: true });
    return () => observer.disconnect();
  }, [initialProduct.name]);
  return <div style={{ position: "fixed", right: 4, top: 4, zIndex: 100, background: "white", padding: 8 }}>
    <button type="button" data-testid="commit-one-product" onClick={() => {
      const metrics = globalThis.__inventoryCardMetrics;
      if (metrics.pending) throw new Error("Synthetic mutation overlap");
      const quantity = initialProduct.quantityByLocation.refrigerated + 1;
      const stockRevision = initialProduct.stockRevision + 1;
      metrics.cardRenders = 0;
      metrics.pending = { startedAt: performance.now(), quantity, stockRevision };
      onSaved({ ...initialProduct, stockRevision, quantityByLocation: { ...initialProduct.quantityByLocation, refrigerated: quantity } });
    }}>서버 확정 결과 반영</button>
    <button type="button" onClick={onClose}>닫기</button>
  </div>;
}
