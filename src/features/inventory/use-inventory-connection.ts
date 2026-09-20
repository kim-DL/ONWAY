"use client";
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  if (!listeners.size) { window.addEventListener("online", notify); window.addEventListener("offline", notify); }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); }
  };
}
export function useInventoryConnection(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
export const INVENTORY_OFFLINE_DRAFT_MESSAGE = "인터넷이 끊겨 저장할 수 없어요. 이 창의 입력은 유지되며, 연결된 뒤 다시 저장해주세요.";
