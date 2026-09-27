import { registerPrivateClientCleanup } from "@/features/auth/private-client-cleanup-registry";

let generation = 0;
const listeners = new Set<(cause: unknown, uid: string | null) => void>();
registerPrivateClientCleanup(() => { generation += 1; });

export function inventoryAccessGeneration() { return generation; }
export function inventoryAuthenticationError() {
  return Object.assign(new Error("unauthenticated"), { code: "unauthenticated" });
}
export function isInventoryAccessFailure(cause: unknown) {
  if (!cause || typeof cause !== "object") return false;
  const code = "code" in cause ? String(cause.code) : "";
  const message = "message" in cause ? String(cause.message) : "";
  return code.endsWith("unauthenticated") || code.endsWith("permission-denied") || /^app[-]?check\//i.test(code)
    || code.endsWith("failed-precondition") && message.includes("현재 세션을 확인할 수 없습니다.");
}
export function reportInventoryAccessFailure(cause: unknown, uid: string | null) {
  if (!isInventoryAccessFailure(cause)) return;
  generation += 1;
  for (const listener of listeners) listener(cause, uid);
}
export function subscribeInventoryAccessFailure(listener: (cause: unknown, uid: string | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
