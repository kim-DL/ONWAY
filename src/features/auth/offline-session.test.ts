import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readVerifiedOfflineSession, writeVerifiedOfflineSession } from "./offline-session";

const session = { uid: "employee", displayName: "테스트 직원", claims: {
  employeeId: "EMP-TEST", roleScopes: ["delivery" as const], sessionVersion: 1, permissionsVersion: 1,
} };
let storage: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
  storage = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("verified display cache is separate from Firebase login lifetime", () => {
  it("restores only the matching UID and expires the display record after 24 hours", () => {
    writeVerifiedOfflineSession(session);
    expect(readVerifiedOfflineSession("another")).toBeNull();
    expect(readVerifiedOfflineSession(session.uid)).toEqual(session);
    vi.advanceTimersByTime(24 * 60 * 60 * 1_000 + 1);
    expect(readVerifiedOfflineSession(session.uid)).toBeNull();
    expect(storage.size).toBe(0);
  });
  it("rejects future-dated, corrupt, or mismatched session records", () => {
    const key = `onnuriway:private:v1:offline-session:${session.uid}`;
    for (const record of ["invalid", JSON.stringify({ ...session, verifiedAt: Date.now() + 1 }),
      JSON.stringify({ ...session, uid: "another", verifiedAt: Date.now() })]) {
      storage.set(key, record);
      expect(readVerifiedOfflineSession(session.uid)).toBeNull();
    }
  });
});
