import { describe, expect, it } from "vitest";
import { auditLogSchema } from "./system";
import { nullableShortTextSchema } from "./common";
import { adminAuditSchema } from "@/features/admin/admin-contract";
import { inventoryAuditSummary } from "../../functions/src/admin/inventory-audit-summary";

const quantities = { refrigerated: 0, freezer1: 9, freezer2: 0, sample: 0 };
const base = { logId: "audit-1", eventType: "INVENTORY_PRODUCT_DELETED", actorUid: "uid-staff", actorEmployeeId: "EMP-STAFF",
  targetType: "inventory", targetId: "product-1", schoolId: null, cycleId: null, changedFields: ["status"],
  requestId: "request-1", appVersion: null, createdAt: new Date("2026-09-11T01:00:00Z") };
const inventoryStatusChange = { productName: "검증 상품", unitLabel: "봉", before: { status: "active", quantityByLocation: quantities },
  after: { status: "deleted", quantityByLocation: quantities } };

describe("inventory audit reason preservation and legacy wire compatibility", () => {
  it("accepts all 2000 characters and optional trusted snapshots without widening unrelated short-text fields", () => {
    const changeReason = `${"가".repeat(1_994)}\n끝까지보존`;
    const record = { ...base, changeReason, inventoryStatusChange };
    expect(auditLogSchema.parse(record)).toEqual(record);
    expect(auditLogSchema.safeParse({ ...record, changeReason: `${changeReason}X` }).success).toBe(false);
    expect(nullableShortTextSchema.safeParse("가".repeat(201)).success).toBe(false);
  });
  it("keeps older records valid and validates structured expiry snapshots strictly", () => {
    expect(auditLogSchema.parse(base)).toEqual(base);
    expect(auditLogSchema.parse({ ...base, changeReason: null })).toMatchObject({ changeReason: null });
    const record = { ...base, eventType: "INVENTORY_LOT_UPDATE", changeReason: "기존 사유", inventoryLotChange: {
      productName: "검증 상품", unitLabel: "봉", originLotId: "lot-1",
      before: { label: "", expiryState: "unknown", expiryDate: null },
      after: { label: "", expiryState: "dated", expiryDate: "2027-01-31" },
    } };
    expect(auditLogSchema.parse(record)).toEqual(record);
    expect(auditLogSchema.safeParse({ ...base, inventoryStatusChange: { ...inventoryStatusChange, unitLabel: null } }).success).toBe(false);
    expect(auditLogSchema.safeParse({ ...base, forgedField: "not accepted" }).success).toBe(false);
  });
  it("keeps the full original reason in the administrator summary without adding fields to its strict DTO", () => {
    const reason = `${"가".repeat(1_994)}\n끝까지보존`;
    const summary = inventoryAuditSummary({ ...base, inventoryStatusChange }, reason);
    expect(summary).toContain(`\n사유: ${reason}`);
    const wire = { logId: base.logId, eventType: base.eventType, actorEmployeeId: base.actorEmployeeId,
      targetType: base.targetType, targetId: base.targetId, changedFields: base.changedFields,
      changeReason: summary, createdAt: base.createdAt.toISOString() };
    expect(adminAuditSchema.parse(wire)).toEqual(wire);
    expect(inventoryAuditSummary(base, reason)).toBe(reason);
  });
});
