import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RevalidationFreshness } from "@/lib/revalidation-coordinator";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

const harness = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, effects: [] as Array<() => void | (() => void)>,
  onData: undefined as undefined | ((customers: Customer[]) => void), onError: undefined as undefined | ((error: unknown, hadData: boolean) => void),
  onFreshness: undefined as undefined | ((status: RevalidationFreshness) => void),
  options: undefined as undefined | { hasData?: boolean; forceInitial?: boolean }, unsubscribe: vi.fn() }));
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
  customerRepository: { subscribe: (_key: string, onData: (customers: Customer[]) => void, onError: (error: unknown, hadData: boolean) => void, onFreshness: typeof harness.onFreshness, options: typeof harness.options) => {
    harness.onData = onData; harness.onError = onError; harness.onFreshness = onFreshness; harness.options = options; return harness.unsubscribe;
  } },
}));

import { useCustomers } from "./use-customers";
import { beginCustomerCatalogRead, clearCustomerWorkspaceSnapshot, commitCustomerCatalogRead, readCustomerWorkspaceSnapshot } from "./customer-workspace-snapshot";

const session = { uid: "EMP", claims: { sessionVersion: 2, permissionsVersion: 3 } } as AuthenticatedSession;
const customer = { customerId: "CUSTOMER", accessPassword: "00123*" } as Customer;
const listeners = new Map<string, () => void>();
beforeEach(() => {
  clearCustomerWorkspaceSnapshot();
  harness.states = []; harness.cursor = 0; harness.effects = []; harness.unsubscribe.mockClear();
  harness.onData = undefined; harness.onError = undefined; harness.onFreshness = undefined; harness.options = undefined; listeners.clear();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) });
});
afterEach(() => { clearCustomerWorkspaceSnapshot(); vi.unstubAllGlobals(); });

describe("memory-only customer view lifecycle", () => {
  it("renders a same-session snapshot immediately and marks it as warm for revalidation", () => {
    readCustomerWorkspaceSnapshot("EMP:2:3");
    const generation = beginCustomerCatalogRead("EMP:2:3");
    commitCustomerCatalogRead("EMP:2:3", [customer], generation);
    const catalog = useCustomers(session);
    expect(catalog).toMatchObject({ status: "ready", customers: [customer] });
    harness.effects[0]!();
    expect(harness.options).toEqual({ hasData: true, forceInitial: false });
  });
  it("keeps a dirty admin draft eligible during a transient refresh failure", () => {
    const clear = vi.fn();
    useCustomers(session, clear); harness.effects[0]!();
    harness.onData!([customer]);
    harness.onFreshness!("refreshing");
    harness.onError!({ code: "functions/unavailable" }, true);
    expect(harness.states[0]).toMatchObject({ status: "ready", customers: [customer], canRetainDraft: true, freshness: "stale-error" });
    expect(clear).not.toHaveBeenCalled();
  });

  it("keeps the editor available when retrying a confirmed empty catalog", () => {
    const catalog = useCustomers(session); harness.effects[0]!();
    harness.onData!([]);
    harness.onError!({ code: "functions/unavailable" }, true);
    catalog.retry();
    expect(harness.states[0]).toMatchObject({ status: "ready", customers: [], canRetainDraft: true, freshness: "refreshing" });
  });

  it.each(["permission-denied", "unauthenticated", "failed-precondition"])("disposes private selection and editor on %s", (code) => {
    const clear = vi.fn();
    useCustomers(session, clear); harness.effects[0]!();
    harness.onData!([customer]); harness.onError!({ code: `functions/${code}` }, false);
    expect(harness.states[0]).toMatchObject({ status: "error", customers: [], canRetainDraft: false });
    expect(clear).toHaveBeenCalledOnce();
  });

  it("keeps the authenticated in-memory list and selection during a mobile network handoff", () => {
    const clear = vi.fn();
    useCustomers(session, clear); harness.effects[0]!(); harness.onData!([customer]);
    vi.stubGlobal("navigator", { onLine: false }); harness.onError!({ code: "functions/unavailable" }, true);
    expect(harness.states[0]).toMatchObject({ status: "ready", customers: [customer], canRetainDraft: true, freshness: "stale-error" });
    expect(clear).not.toHaveBeenCalled();
    harness.onData!([{ ...customer, customerId: "late" }]);
    expect(harness.states[0]).toMatchObject({ customers: [customer], freshness: "stale-error" });
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
