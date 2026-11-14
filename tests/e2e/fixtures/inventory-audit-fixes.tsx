import { useState } from "react";
import { createRoot } from "react-dom/client";
import { inventoryLocationMap, inventoryProductSchema } from "../../../src/domain/inventory";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { inventoryKoreaDate } from "../../../src/features/inventory/inventory-calendar";
import { InventoryProductEditorImpl } from "../../../src/features/inventory/inventory-product-editor";
import { InventoryWorkspace } from "../../../src/features/inventory/inventory-workspace";

export type InventoryAuditFixes = {
  calls: Array<{ name: string; afterId: unknown }>;
  referenceCalls: number;
  releaseFirstPage: (() => void) | null;
  releaseSecondPage: (() => void) | null;
  invoke: (name: string, input: Record<string, unknown>) => Promise<{ data: unknown }>;
};
declare global { interface Window { __inventoryAuditFixes: InventoryAuditFixes } }

const product = (productId: string) => inventoryProductSchema.parse({
  productId, companyId: "onnuri", name: productId, manufacturer: "합성 제조사 A", specification: "", origin: "",
  unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active",
  revision: 0, stockRevision: 0, hasHistory: false, quantityByLocation: inventoryLocationMap(0),
  nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null,
  createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z",
  createdBy: "synthetic-employee", updatedBy: "synthetic-employee",
});
const session: AuthenticatedSession = {
  uid: "synthetic-employee", displayName: "합성 직원",
  claims: { employeeId: "SYNTHETIC", roleScopes: ["viewer"], sessionVersion: 1, permissionsVersion: 1 },
};
const scenario = new URLSearchParams(location.search).get("scenario");
const context = {
  today: inventoryKoreaDate(), canWrite: false, canAdmin: false,
  settings: { urgentDays: 7, weekday: 1, revision: 1, pendingWeekday: null, effectiveDate: null, updatedAt: null, updatedBy: null },
  cycle: { cycleId: "synthetic-cycle", startDate: "2026-01-01", nextDate: "2099-01-01", weekday: 1 },
};
window.__inventoryAuditFixes = {
  calls: [], referenceCalls: 0, releaseFirstPage: null, releaseSecondPage: null,
  invoke: async (name, input) => {
    window.__inventoryAuditFixes.calls.push({ name, afterId: input.afterId ?? null });
    if (name === "getInventoryContext") {
      if (scenario === "failed-context") throw { code: "functions/unavailable" };
      return { data: context };
    }
    if (name !== "listInventoryProducts") throw new Error(`Unexpected callable ${name}`);
    if (scenario === "reentry") {
      if (input.afterId === null) return { data: { products: [product("page-1")], nextCursor: "page-1" } };
      if (input.afterId === "page-1") return new Promise((resolve) => {
        window.__inventoryAuditFixes.releaseSecondPage = () => resolve({ data: { products: [product("page-2")], nextCursor: "page-2" } });
      });
    }
    if (input.afterId === null) return new Promise((resolve) => {
      window.__inventoryAuditFixes.releaseFirstPage = () => resolve({ data: { products: [product("page-1")], nextCursor: "page-1" } });
    });
    if (input.afterId === "page-1") return { data: { products: [product("page-2")], nextCursor: "page-2" } };
    return { data: { products: [product("page-3")], nextCursor: null } };
  },
};

function App() {
  const [visible, setVisible] = useState(true);
  return <main className="workspace-shell" data-mode="inventory">
    {scenario === "manufacturer" ? <InventoryProductEditorImpl product={product("synthetic-product")} location="refrigerated"
      canCreateManufacturer={false} onClose={() => setVisible(false)} onSaved={() => { throw new Error("Saving is outside this fixture"); }} />
      : <><button onClick={() => setVisible((current) => !current)}>{visible ? "재고 화면 나가기" : "재고 화면 다시 열기"}</button>
        <div className="workspace-content">{visible ? <InventoryWorkspace session={session} /> : <p>다른 화면</p>}</div></>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
