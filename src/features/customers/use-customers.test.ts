import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

const harness = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, effects: [] as Array<() => void | (() => void)>,
  onData: undefined as undefined | ((customers: Customer[]) => void), onError: undefined as undefined | ((error: unknown) => void), unsubscribe: vi.fn() }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }];
  },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));
vi.mock("./customer-repository", () => ({
  customerErrorMessage: () => "정보 확인 필요",
  customerRepository: { subscribe: (onData: (customers: Customer[]) => void, onError: (error: unknown) => void) => {
    harness.onData = onData; harness.onError = onError; return harness.unsubscribe;
  } },
}));

import { useCustomers } from "./use-customers";

const session = { uid: "EMP", claims: { sessionVersion: 2, permissionsVersion: 3 } } as AuthenticatedSession;
const customer = { customerId: "CUSTOMER", accessPassword: "00123*" } as Customer;
const listeners = new Map<string, () => void>();
beforeEach(() => {
  harness.states = []; harness.cursor = 0; harness.effects = []; harness.unsubscribe.mockClear();
  harness.onData = undefined; harness.onError = undefined; listeners.clear();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) });
});
afterEach(() => vi.unstubAllGlobals());

describe("memory-only customer view lifecycle", () => {
  it("keeps a dirty admin draft eligible during a transient refresh failure", () => {
    const clear = vi.fn();
    useCustomers(session, clear); harness.effects[0]!();
    harness.onData!([customer]);
    harness.onError!({ code: "functions/unavailable" });
    expect(harness.states[0]).toMatchObject({ status: "error", customers: [], canRetainDraft: true });
    expect(clear).not.toHaveBeenCalled();
  });

  it.each(["permission-denied", "unauthenticated", "failed-precondition"])("disposes private selection and editor on %s", (code) => {
    const clear = vi.fn();
    useCustomers(session, clear); harness.effects[0]!();
    harness.onData!([customer]); harness.onError!({ code: `functions/${code}` });
    expect(harness.states[0]).toMatchObject({ status: "error", customers: [], canRetainDraft: false });
    expect(clear).toHaveBeenCalledOnce();
  });

  it("clears private records, selection, and editor as soon as offline is reported", () => {
    const clear = vi.fn();
    useCustomers(session, clear); harness.effects[0]!(); harness.onData!([customer]);
    vi.stubGlobal("navigator", { onLine: false }); listeners.get("offline")!();
    expect(harness.states[0]).toMatchObject({ status: "error", customers: [], canRetainDraft: false });
    expect(clear).toHaveBeenCalledOnce();
    harness.onData!([customer]);
    expect(harness.states[0]).toMatchObject({ customers: [], canRetainDraft: false });
  });

  it("ignores late network responses after unmount", () => {
    useCustomers(session);
    const cleanup = harness.effects[0]!() as () => void;
    cleanup(); harness.onData!([customer]);
    expect(harness.states[0]).toMatchObject({ status: "loading", customers: [] });
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(listeners.has("offline")).toBe(false);
  });

  it("never displays a previous session's records during a key change", () => {
    useCustomers(session); harness.effects[0]!(); harness.onData!([customer]);
    harness.cursor = 0;
    const next = useCustomers({ ...session, uid: "ANOTHER" });
    expect(next.status).toBe("loading"); expect(next.customers).toEqual([]); expect(next.canRetainDraft).toBe(false);
  });
});
