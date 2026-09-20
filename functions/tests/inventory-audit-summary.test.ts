import { describe, expect, it } from "vitest";
import { inventoryAuditSummary } from "../src/admin/inventory-audit-summary.js";

const quantities = { refrigerated: 0, freezer1: 20, freezer2: 3, sample: 0 };
const status = { productName: "냉동 돈까스", unitLabel: "봉", before: { status: "active", quantityByLocation: quantities }, after: { status: "deleted", quantityByLocation: quantities } };
describe("inventory audit presentation without changing the admin wire contract", () => {
  it("identifies the product, state transition and retained stock on an employee deletion", () => {
    const result = inventoryAuditSummary({ eventType: "INVENTORY_PRODUCT_DELETED", inventoryStatusChange: status }, "중복 등록");
    expect(result).toBe("냉동 돈까스 · 사용 중 → 삭제 · 재고 보존: 냉동1 20봉 · 냉동2 3봉\n사유: 중복 등록");
  });
  it("describes a quantity change honestly instead of calling it preserved", () => {
    const changed = { ...status, after: { status: "inactive", quantityByLocation: { ...quantities, freezer1: 0 } } };
    expect(inventoryAuditSummary({ eventType: "INVENTORY_PRODUCT_STATUS_CHANGED", inventoryStatusChange: changed }, null)).toBe("냉동 돈까스 · 사용 중 → 비활성 · 냉동1 20봉 · 냉동2 3봉 → 냉동2 3봉");
  });
  it("automatically explains a dated lot edit with no manually entered reason", () => {
    expect(inventoryAuditSummary({ eventType: "INVENTORY_LOT_UPDATE", inventoryLotChange: {
      productName: "감자", unitLabel: "봉", originLotId: "lot-1",
      before: { label: "", expiryState: "unknown", expiryDate: null },
      after: { label: "첫 입고", expiryState: "dated", expiryDate: "2026-12-25" },
    } }, null)).toBe("감자 · 유통기한 미확인 → 2026-12-25 (첫 입고)");
  });
  it("keeps legacy audit records and rejects malformed snapshots without breaking the list", () => {
    expect(inventoryAuditSummary({ eventType: "INVENTORY_PRODUCT_DELETED" }, "기존 사유")).toBe("기존 사유");
    expect(inventoryAuditSummary({ eventType: "INVENTORY_PRODUCT_DELETED", inventoryStatusChange: { ...status, unitLabel: null } }, null)).toBeNull();
    expect(inventoryAuditSummary({ eventType: "EMPLOYEE_UPDATED", inventoryStatusChange: status }, "기존 사유")).toBe("기존 사유");
  });
});
