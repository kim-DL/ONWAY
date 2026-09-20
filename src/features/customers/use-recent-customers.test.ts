import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

const harness = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as Array<{ deps?: readonly unknown[]; value?: unknown; cleanup?: (() => void) | undefined }>,
  effects: [] as Array<() => void>,
  changed(previous: readonly unknown[] | undefined, next: readonly unknown[]) {
    return !previous || previous.length !== next.length || previous.some((value, index) => !Object.is(value, next[index]));
  },
}));

// Exercise hook lifetime and event closures using the real history store, without
// adding a DOM dependency. Browser integration additionally covers the real renderer.
vi.mock("react", () => ({
  useMemo: (compute: () => unknown, deps: readonly unknown[]) => {
    const index = harness.cursor++;
    if (harness.changed(harness.cells[index]?.deps, deps)) harness.cells[index] = { deps, value: compute() };
    return harness.cells[index]!.value;
  },
  useCallback: (callback: unknown, deps: readonly unknown[]) => {
    const index = harness.cursor++;
    if (harness.changed(harness.cells[index]?.deps, deps)) harness.cells[index] = { deps, value: callback };
    return harness.cells[index]!.value;
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    harness.cells[index] ??= { value: { current: initial } };
    return harness.cells[index]!.value;
  },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = harness.cursor++;
    if (!harness.changed(harness.cells[index]?.deps, deps)) return;
    const previous = harness.cells[index];
    harness.effects.push(() => {
      previous?.cleanup?.();
      harness.cells[index] = { deps, cleanup: effect() || undefined };
    });
  },
  useSyncExternalStore: (subscribe: (callback: () => void) => () => void, getSnapshot: () => unknown) => {
    const index = harness.cursor++;
    if (harness.cells[index]?.value !== subscribe) {
      const previous = harness.cells[index];
      harness.effects.push(() => {
        previous?.cleanup?.();
        harness.cells[index] = { value: subscribe, cleanup: subscribe(() => {}) };
      });
    }
    return getSnapshot();
  },
}));

import { recentCustomerStorageKey } from "./recent-customer-history";
import { useRecentCustomers } from "./use-recent-customers";

const session = { uid: "EMP", claims: { sessionVersion: 2, permissionsVersion: 3 } } as AuthenticatedSession;
const first = { customerId: "customer_a", name: "테스트 거래처", accessPassword: "00123*", officialAddress: "테스트 주소" } as Customer;
const second = { customerId: "customer_b", name: "두 번째 거래처" } as Customer;
const catalog = [first, second];
const values = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  removeItem: vi.fn((key: string) => { values.delete(key); }),
};

function RenderRecentCustomers(activeSession = session, customers: readonly Customer[] = catalog): ReturnType<typeof useRecentCustomers> {
  harness.cursor = 0;
  const result = useRecentCustomers(activeSession, customers);
  const effects = harness.effects.splice(0);
  effects.forEach((effect) => effect());
  if (effects.length) return RenderRecentCustomers(activeSession, customers);
  return result;
}

beforeEach(() => {
  harness.cursor = 0; harness.cells = []; harness.effects = []; values.clear();
  storage.getItem.mockClear(); storage.setItem.mockClear(); storage.removeItem.mockClear();
  vi.stubGlobal("window", { localStorage: storage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  harness.cells.forEach((cell) => cell.cleanup?.());
  vi.unstubAllGlobals();
});

describe("useRecentCustomers session and authorization boundaries", () => {
  it("never records on initial render/catalog refresh and stores only an explicitly selected ID", () => {
    const view = RenderRecentCustomers();
    expect(view.ready).toBe(true);
    expect(view.recentCustomers).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
    view.rememberCustomer(first.customerId);
    expect(RenderRecentCustomers().recentCustomers).toEqual([first]);
    expect(values.get(recentCustomerStorageKey(session))).toBe('["customer_a"]');
    expect([...values.values()].join()).not.toMatch(/거래처|주소|00123|officialAddress|accessPassword/);
  });

  it("retains stored IDs while the catalog loads, resolving only available fresh objects", () => {
    values.set(recentCustomerStorageKey(session), '["deleted","customer_a"]');
    expect(RenderRecentCustomers(session, []).recentCustomers).toEqual([]);
    const updated = { ...first, name: "변경된 이름" };
    expect(RenderRecentCustomers(session, [updated]).recentCustomers[0]).toBe(updated);
    expect(RenderRecentCustomers(session, []).recentCustomers).toEqual([]);
    expect(values.get(recentCustomerStorageKey(session))).toBe('["deleted","customer_a"]');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("uses current authorization even when a caller retains an older callback", () => {
    const stale = RenderRecentCustomers().rememberCustomer;
    RenderRecentCustomers(session, [second]);
    stale(first.customerId);
    expect(storage.setItem).not.toHaveBeenCalled();
    stale(second.customerId);
    expect(RenderRecentCustomers(session, [second]).recentCustomers).toEqual([second]);
    RenderRecentCustomers(session, []);
    stale(second.customerId);
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it.each(["uid", "sessionVersion", "permissionsVersion"] as const)("isolates a changed %s immediately and ignores the previous session callbacks", (field) => {
    const previous = RenderRecentCustomers(); previous.rememberCustomer(first.customerId);
    const nextSession = field === "uid" ? { ...session, uid: "OTHER" }
      : { ...session, claims: { ...session.claims, [field]: session.claims[field] + 1 } };
    harness.cursor = 0;
    const beforeCommit = useRecentCustomers(nextSession, catalog);
    expect(beforeCommit.recentCustomers).toEqual([]);
    expect(beforeCommit.ready).toBe(false);
    harness.effects.splice(0).forEach((effect) => effect());
    const current = RenderRecentCustomers(nextSession);
    current.rememberCustomer(second.customerId);
    previous.rememberCustomer(first.customerId); previous.clearRecentCustomers();
    expect(RenderRecentCustomers(nextSession).recentCustomers).toEqual([second]);
    expect(values.get(recentCustomerStorageKey(session))).toBe('["customer_a"]');
    expect(values.get(recentCustomerStorageKey(nextSession))).toBe('["customer_b"]');
  });

  it("clears recent IDs without modifying current customer objects", () => {
    const view = RenderRecentCustomers(); view.rememberCustomer(first.customerId);
    view.clearRecentCustomers();
    expect(RenderRecentCustomers().recentCustomers).toEqual([]);
    expect(first.accessPassword).toBe("00123*");
    expect(values.size).toBe(0);
  });
});
