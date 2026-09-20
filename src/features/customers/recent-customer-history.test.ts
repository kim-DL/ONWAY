import { afterEach, describe, expect, it, vi } from "vitest";

import { createRecentCustomerHistoryStore, parseRecentCustomerIds, recentCustomerStorageKey, resolveRecentCustomers, type RecentCustomerEnvironment } from "./recent-customer-history";

const scope = { uid: "employee-1", claims: { sessionVersion: 2, permissionsVersion: 3 } };
const key = recentCustomerStorageKey(scope);
const allowed = new Set(["a", "b", "c", "d", "e", "f", "g"]);

function environment() {
  const values = new Map<string, string>();
  const callbacks = new Set<() => void>();
  const storage = {
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { values.set(name, value); }),
    removeItem: vi.fn((name: string) => { values.delete(name); }),
  };
  const instance: RecentCustomerEnvironment = {
    getStorage: vi.fn(() => storage),
    subscribeStorage: vi.fn((_name, callback) => { callbacks.add(callback); return () => { callbacks.delete(callback); }; }),
  };
  return { instance, values, storage, callbacks, change: () => { callbacks.forEach((callback) => callback()); } };
}

afterEach(() => vi.unstubAllGlobals());

describe("ID-only recent customer history", () => {
  it("separates users, login versions and permissions under the private cleanup prefix", () => {
    expect(key).toMatch(/^onnuriway:private:/);
    const keys = [key,
      recentCustomerStorageKey({ ...scope, uid: "employee-2" }),
      recentCustomerStorageKey({ ...scope, claims: { ...scope.claims, sessionVersion: 3 } }),
      recentCustomerStorageKey({ ...scope, claims: { ...scope.claims, permissionsVersion: 4 } }),
    ];
    expect(new Set(keys).size).toBe(4);
    expect(recentCustomerStorageKey({ ...scope, uid: "employee:2/3" })).toContain("employee%3A2%2F3");
  });

  it.each([null, "", "not json", "{}", '[{"customerId":"a","phone":"01012345678"}]', '["a",null]', '["a",3]', '["a","../private"]', '["a","한글 이름"]', JSON.stringify(["a".repeat(129)]), " ".repeat(4097)])("rejects corrupt or non-ID payloads: %s", (raw) => {
    expect(parseRecentCustomerIds(raw)).toEqual([]);
  });

  it("deduplicates and caps an existing valid payload at five IDs", () => {
    expect(parseRecentCustomerIds('["a","b","a","c","d","e","f"]')).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not read browser storage until subscribed and never includes history on the server", () => {
    const env = environment();
    env.values.set(key, '["a"]');
    const store = createRecentCustomerHistoryStore(key, env.instance);
    expect(store.getSnapshot()).toEqual({ ready: false, ids: [] });
    expect(store.getServerSnapshot()).toEqual({ ready: false, ids: [] });
    expect(env.instance.getStorage).not.toHaveBeenCalled();
    const cleanup = store.subscribe(vi.fn());
    expect(store.getSnapshot()).toEqual({ ready: true, ids: ["a"] });
    expect(store.getServerSnapshot()).toEqual({ ready: false, ids: [] });
    expect(env.storage.setItem).not.toHaveBeenCalled();
    cleanup();
  });

  it("records only explicit authorized selections, preserving rapid order without render races", () => {
    const env = environment();
    const store = createRecentCustomerHistoryStore(key, env.instance);
    const cleanup = store.subscribe(vi.fn());
    store.remember("unknown", allowed);
    store.remember("not/an/id", new Set(["not/an/id"]));
    expect(env.storage.setItem).not.toHaveBeenCalled();
    for (const id of ["a", "b", "c", "d", "e", "f", "c"]) store.remember(id, allowed);
    expect(store.getSnapshot().ids).toEqual(["c", "f", "e", "d", "b"]);
    expect(JSON.parse(env.values.get(key)!)).toEqual(["c", "f", "e", "d", "b"]);
    expect(env.storage.setItem.mock.calls.every(([, value]) => (JSON.parse(value) as unknown[]).every((id) => typeof id === "string"))).toBe(true);
    cleanup();
  });

  it("resolves only current authorized objects and does not erase IDs during an empty loading catalog", () => {
    const env = environment();
    env.values.set(key, '["a","deleted","b"]');
    const store = createRecentCustomerHistoryStore(key, env.instance);
    const cleanup = store.subscribe(vi.fn());
    const current = { customerId: "b", name: "현재 이름", accessPassword: "new-value" };
    expect(resolveRecentCustomers(store.getSnapshot().ids, [])).toEqual([]);
    expect(resolveRecentCustomers(store.getSnapshot().ids, [current])).toEqual([current]);
    expect(resolveRecentCustomers(store.getSnapshot().ids, [current])[0]).toBe(current);
    expect(env.values.get(key)).toBe('["a","deleted","b"]');
    expect(env.storage.setItem).not.toHaveBeenCalled();
    store.remember("a", allowed);
    expect(store.getSnapshot().ids).toEqual(["a", "b"]);
    cleanup();
  });

  it("persists across independent mounts and removes only the current namespace on clear", () => {
    const env = environment();
    env.values.set("another-key", '["b"]');
    const first = createRecentCustomerHistoryStore(key, env.instance);
    const unmount = first.subscribe(vi.fn());
    first.remember("a", allowed); unmount();
    const second = createRecentCustomerHistoryStore(key, env.instance);
    const cleanup = second.subscribe(vi.fn());
    expect(second.getSnapshot().ids).toEqual(["a"]);
    second.clear();
    expect(second.getSnapshot()).toEqual({ ready: true, ids: [] });
    expect(env.values.has(key)).toBe(false);
    expect(env.values.get("another-key")).toBe('["b"]');
    cleanup();
  });

  it("uses the latest persisted list before writing and never resurrects a removed record", () => {
    const env = environment();
    const store = createRecentCustomerHistoryStore(key, env.instance);
    const cleanup = store.subscribe(vi.fn());
    store.remember("a", allowed);
    env.values.set(key, '["b","a"]');
    store.remember("c", allowed);
    expect(store.getSnapshot().ids).toEqual(["c", "b", "a"]);
    env.values.delete(key);
    store.remember("d", allowed);
    expect(store.getSnapshot().ids).toEqual(["d"]);
    cleanup();
  });

  it("reacts to cross-tab changes and detaches listeners/stale mutations at unmount", () => {
    const env = environment();
    const store = createRecentCustomerHistoryStore(key, env.instance);
    const notify = vi.fn();
    const cleanup = store.subscribe(notify);
    env.values.set(key, '["a"]'); env.change();
    expect(store.getSnapshot().ids).toEqual(["a"]);
    const same = store.getSnapshot(); env.change();
    expect(store.getSnapshot()).toBe(same);
    env.values.delete(key); env.change();
    expect(store.getSnapshot().ids).toEqual([]);
    cleanup();
    expect(env.callbacks.size).toBe(0);
    store.remember("b", allowed); store.clear();
    expect(env.storage.setItem).not.toHaveBeenCalled();
    expect(env.storage.removeItem).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual({ ready: false, ids: [] });
  });

  it("rehydrates after StrictMode unsubscribe/resubscribe without erasing stored IDs", () => {
    const env = environment(); env.values.set(key, '["b","a"]');
    const store = createRecentCustomerHistoryStore(key, env.instance);
    store.subscribe(vi.fn())();
    const cleanup = store.subscribe(vi.fn());
    expect(store.getSnapshot()).toEqual({ ready: true, ids: ["b", "a"] });
    expect(env.callbacks.size).toBe(1);
    expect(env.storage.removeItem).not.toHaveBeenCalled();
    cleanup();
  });

  it.each(["getStorage", "getItem", "setItem"] as const)("supports repeated in-memory choices when %s is blocked", (method) => {
    const env = environment();
    const blocked = () => { throw new DOMException("Blocked", "SecurityError"); };
    if (method === "getStorage") env.instance.getStorage = blocked;
    else env.storage[method].mockImplementation(blocked);
    const store = createRecentCustomerHistoryStore(key, env.instance);
    const cleanup = store.subscribe(vi.fn());
    expect(store.getSnapshot().ready).toBe(true);
    expect(() => { store.remember("a", allowed); store.remember("b", allowed); }).not.toThrow();
    expect(store.getSnapshot().ids).toEqual(["b", "a"]);
    cleanup();
  });

  it("clears in-memory results even when removal is blocked", () => {
    const env = environment(); env.values.set(key, '["a"]');
    const store = createRecentCustomerHistoryStore(key, env.instance);
    const cleanup = store.subscribe(vi.fn());
    env.storage.removeItem.mockImplementation(() => { throw new Error("Blocked"); });
    expect(() => store.clear()).not.toThrow();
    expect(store.getSnapshot().ids).toEqual([]);
    store.remember("b", allowed);
    expect(store.getSnapshot().ids).toEqual(["b"]);
    cleanup();
  });

  it("handles an unavailable storage object", () => {
    const store = createRecentCustomerHistoryStore(key, { getStorage: () => null, subscribeStorage: () => () => {} });
    const cleanup = store.subscribe(vi.fn());
    store.remember("a", allowed);
    expect(store.getSnapshot()).toEqual({ ready: true, ids: ["a"] });
    cleanup();
  });

  it("ignores other storage keys and sessionStorage browser events", () => {
    const env = environment();
    let onStorage: (event: Pick<StorageEvent, "key" | "storageArea">) => void = () => {};
    const remove = vi.fn();
    vi.stubGlobal("window", { localStorage: env.storage, addEventListener: (_name: string, callback: typeof onStorage) => { onStorage = callback; }, removeEventListener: remove });
    const store = createRecentCustomerHistoryStore(key);
    const cleanup = store.subscribe(vi.fn());
    env.values.set(key, '["a"]');
    onStorage({ key: "another", storageArea: env.storage as unknown as Storage });
    onStorage({ key, storageArea: {} as Storage });
    expect(store.getSnapshot().ids).toEqual([]);
    onStorage({ key, storageArea: env.storage as unknown as Storage });
    expect(store.getSnapshot().ids).toEqual(["a"]);
    env.values.clear(); onStorage({ key: null, storageArea: env.storage as unknown as Storage });
    expect(store.getSnapshot().ids).toEqual([]);
    cleanup(); expect(remove).toHaveBeenCalledOnce();
  });
});
