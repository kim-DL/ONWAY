import { describe, expect, it, vi } from "vitest";
import { runRegisteredPrivateClientCleanups } from "@/features/auth/private-client-cleanup-registry";
import { inventoryAccessGeneration, isInventoryAccessFailure, reportInventoryAccessFailure, subscribeInventoryAccessFailure } from "./inventory-access-boundary";

describe("inventory access invalidation", () => {
  it.each(["functions/unauthenticated", "functions/permission-denied", "appCheck/recaptcha-error", "app-check/token-error"])("recognizes %s", (code) => {
    expect(isInventoryAccessFailure({ code })).toBe(true);
  });
  it("distinguishes revoked sessions from business conflicts and transient errors", () => {
    expect(isInventoryAccessFailure({ code: "functions/failed-precondition", message: "현재 세션을 확인할 수 없습니다." })).toBe(true);
    for (const code of ["failed-precondition", "unavailable", "not-found", "aborted"]) expect(isInventoryAccessFailure({ code, message: "재고 상태를 확인해주세요." })).toBe(false);
  });
  it("notifies and invalidates only access failures, and unsubscribes", () => {
    const listener = vi.fn(); const unsubscribe = subscribeInventoryAccessFailure(listener);
    const generation = inventoryAccessGeneration();
    reportInventoryAccessFailure({ code: "unavailable" }, "employee-1");
    expect(inventoryAccessGeneration()).toBe(generation);
    const cause = { code: "permission-denied" };
    reportInventoryAccessFailure(cause, "employee-1");
    expect(listener).toHaveBeenCalledWith(cause, "employee-1");
    expect(inventoryAccessGeneration()).toBe(generation + 1);
    unsubscribe(); reportInventoryAccessFailure(cause, "employee-1");
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("invalidates pending responses when private state is cleared", async () => {
    const generation = inventoryAccessGeneration();
    await runRegisteredPrivateClientCleanups();
    expect(inventoryAccessGeneration()).toBe(generation + 1);
  });
});
