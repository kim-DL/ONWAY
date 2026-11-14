import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "@/domain/customer";

type Effect = { deps: readonly unknown[]; cleanup?: () => void };
const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as Array<{ current: unknown }>, effects: [] as Effect[], pending: [] as Array<() => void>,
  stateCursor: 0, refCursor: 0, effectCursor: 0, writes: 0, reverse: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [harness.states[index], (next: unknown) => { harness.writes++; harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }];
  },
  useRef: (initial: unknown) => {
    const index = harness.refCursor++;
    return harness.refs[index] ??= { current: initial };
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = harness.effectCursor++;
    const previous = harness.effects[index];
    if (previous && deps.length === previous.deps.length && deps.every((value, position) => Object.is(value, previous.deps[position]))) return;
    harness.pending.push(() => {
      previous?.cleanup?.();
      const cleanup = effect();
      harness.effects[index] = { deps, ...(cleanup ? { cleanup } : {}) };
    });
  },
}));
vi.mock("./customer-repository", () => ({ customerRepository: { reverseLocation: harness.reverse } }));

import { customerDirectoryEntry } from "./customer-directory-filter";
import { useCustomerDirectoryRegions } from "./use-customer-directory-regions";
import { clearCustomerDirectoryRegionCache } from "./customer-directory-region-cache";
import { discardCustomerWorkspaceCatalog, readCustomerWorkspaceSnapshot, clearCustomerWorkspaceSnapshot } from "./customer-workspace-snapshot";
import { runRegisteredPrivateClientCleanups } from "@/features/auth/private-client-cleanup-registry";

function customer(id: string, overrides: Partial<Customer> = {}): Customer {
  return { customerId: id, companyId: "onnuri", name: `거래처 ${id}`, normalizedName: id, choseongName: id,
    district: "", administrativeDong: "", officialAddress: "대전 서구 둔산로 100", deliveryAddress: "대전 서구 둔산로 100",
    deliveryPoint: { latitude: 36.35, longitude: 127.38 }, deliveryLocationDescription: "후문", accessPassword: "", accessPasswordState: "none", contacts: [],
    status: "active", noticeType: "none", changeNote: "", revision: 1, createdAt: "2026-09-06T00:00:00.000Z", createdBy: "EMP", updatedAt: "2026-09-06T00:00:00.000Z", updatedBy: "EMP", ...overrides };
}
function DirectoryRegionsHarness(customers: readonly Customer[], enabled = true, namespace = "EMP:1:1") {
  harness.stateCursor = 0; harness.refCursor = 0; harness.effectCursor = 0;
  const value = useCustomerDirectoryRegions(namespace, customers, enabled);
  harness.pending.splice(0).forEach((effect) => effect());
  return value;
}
const render = DirectoryRegionsHarness;
function unmount() { harness.effects.forEach((effect) => effect.cleanup?.()); }
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const resolved = { district: "서구", administrativeDong: "둔산2동", address: "API 주소는 절대 덮어쓰지 않음" };
function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  clearCustomerWorkspaceSnapshot();
  clearCustomerDirectoryRegionCache();
  harness.states = []; harness.refs = []; harness.effects = []; harness.pending = [];
  harness.stateCursor = 0; harness.refCursor = 0; harness.effectCursor = 0; harness.writes = 0;
  harness.reverse.mockReset().mockResolvedValue(resolved);
});
afterEach(() => { unmount(); clearCustomerDirectoryRegionCache(); });

function remount() {
  unmount();
  harness.states = []; harness.refs = []; harness.effects = []; harness.pending = [];
}

describe("read-only customer directory region enrichment", () => {
  it("enriches only region fields, never mutates customers or replaces saved addresses", async () => {
    const source = [customer("A")]; const before = structuredClone(source);
    expect(render(source).pendingCount).toBe(1); await flush();
    const result = render(source);
    expect(result).toMatchObject({ pendingCount: 0, failedCount: 0 });
    expect(result.customers[0]).toEqual({ ...source[0], district: "서구", administrativeDong: "둔산2동" });
    expect(source).toEqual(before);
    expect(harness.reverse).toHaveBeenCalledExactlyOnceWith(source[0]!.deliveryPoint);
  });

  it("does no requests while disabled, for invalid/no pin, or already established regions", async () => {
    const source = [customer("A"), customer("B", { deliveryPoint: null }), customer("C", { deliveryPoint: { latitude: NaN, longitude: 127 } }), customer("D", { district: "서구", administrativeDong: "둔산2동" })];
    expect(render(source, false).pendingCount).toBe(0); await flush(); expect(harness.reverse).not.toHaveBeenCalled();
    render(source.slice(1)); await flush(); expect(harness.reverse).not.toHaveBeenCalled();
    expect(render(source.slice(1)).customers).toHaveLength(3);
  });

  it("corrects stale regions identified from a changed address", async () => {
    const source = [customer("A", { district: "유성구", administrativeDong: "온천1동" })];
    expect(customerDirectoryEntry(source[0]!).dong).toBe("행정동 미확인");
    render(source); await flush();
    expect(customerDirectoryEntry(render(source).customers[0]!)).toMatchObject({ district: "대전광역시 서구", dong: "둔산2동" });
  });

  it("limits real in-flight calls to three and eventually resolves every row", async () => {
    const source = Array.from({ length: 8 }, (_, index) => customer(String(index)));
    const requests: Array<ReturnType<typeof deferred<typeof resolved>>> = [];
    let active = 0, maximum = 0;
    harness.reverse.mockImplementation(() => {
      const request = deferred<typeof resolved>(); requests.push(request); maximum = Math.max(maximum, ++active);
      return request.promise.finally(() => { active--; });
    });
    expect(render(source).pendingCount).toBe(8); await flush(); expect(requests).toHaveLength(3);
    for (let index = 0; index < 8; index++) { requests[index]!.resolve(resolved); await flush(); }
    expect(maximum).toBe(3); expect(harness.reverse).toHaveBeenCalledTimes(8);
    expect(render(source)).toMatchObject({ pendingCount: 0, failedCount: 0 });
    expect(render(source).customers).toHaveLength(8);
  });

  it("caches successful lookups through empty loading snapshots and identical catalog refreshes", async () => {
    const source = [customer("A")]; render(source); await flush();
    render(structuredClone(source)); await flush();
    render([], false); await flush();
    render(source); await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(1);
    expect(render(source).customers[0]!.administrativeDong).toBe("둔산2동");
  });

  it("reuses a completed lookup after closing and reopening the directory", async () => {
    const source = [customer("A")]; render(source); await flush();
    remount();
    expect(render(structuredClone(source))).toMatchObject({ pendingCount: 0, failedCount: 0 });
    await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(1);
    expect(render(source).customers[0]!.administrativeDong).toBe("둔산2동");
  });

  it("joins the same in-flight lookup after reopening and preserves its result", async () => {
    const request = deferred<typeof resolved>(); harness.reverse.mockReturnValueOnce(request.promise);
    const source = [customer("A")]; render(source); await flush();
    remount(); render(source); await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(1);
    request.resolve(resolved); await flush();
    expect(render(source)).toMatchObject({ pendingCount: 0, failedCount: 0 });
    expect(render(source).customers[0]!.administrativeDong).toBe("둔산2동");
  });

  it.each(["OTHER:1:1", "EMP:2:1", "EMP:1:2"])("isolates %s and rejects a late old-session result", async (namespace) => {
    const request = deferred<typeof resolved>(); harness.reverse.mockReturnValueOnce(request.promise);
    const source = [customer("A")]; render(source); await flush();
    render(source, true, namespace); await flush();
    request.resolve({ ...resolved, administrativeDong: "이전 세션 지역" }); await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(2);
    expect(render(source, true, namespace).customers[0]!.administrativeDong).toBe("둔산2동");
  });

  it.each(["private cleanup", "catalog permission failure", "workspace session change"])("clears cached regions on %s", async (event) => {
    readCustomerWorkspaceSnapshot("EMP:1:1");
    const source = [customer("A")]; render(source); await flush(); remount();
    if (event === "private cleanup") await runRegisteredPrivateClientCleanups();
    else if (event === "catalog permission failure") discardCustomerWorkspaceCatalog("EMP:1:1");
    else readCustomerWorkspaceSnapshot("EMP:2:1");
    render(source); await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(2);
  });

  it("drops retained regions on authorization failure and rejects older concurrent responses after retry", async () => {
    const source = [customer("A"), customer("B"), customer("C")];
    const denied = deferred<typeof resolved>(), late = deferred<typeof resolved>();
    harness.reverse.mockResolvedValueOnce(resolved).mockReturnValueOnce(denied.promise).mockReturnValueOnce(late.promise);
    render(source); await flush();
    denied.reject({ code: "functions/permission-denied" }); await flush();
    const failed = render(source);
    expect(failed).toMatchObject({ pendingCount: 0, failedCount: 3 });
    expect(failed.customers.every((row) => row.administrativeDong === "")).toBe(true);
    failed.retry(); await flush();
    late.resolve({ ...resolved, administrativeDong: "권한 실패 전 지역" }); await flush(); await flush();
    expect(render(source).customers.every((row) => row.administrativeDong === "둔산2동")).toBe(true);
    expect(harness.reverse).toHaveBeenCalledTimes(6);
  });

  it("discards stale coordinate responses and never exceeds three calls across canceled generations", async () => {
    const source = [customer("A"), customer("B"), customer("C")];
    const oldRequests = source.map(() => deferred<typeof resolved>());
    let index = 0;
    harness.reverse.mockImplementation(() => index < 3 ? oldRequests[index++]!.promise : Promise.resolve({ ...resolved, administrativeDong: "둔산3동" }));
    render(source); await flush();
    const moved = source.map((row) => ({ ...row, deliveryPoint: { latitude: 36.4, longitude: 127.4 } }));
    render(moved); await flush(); expect(harness.reverse).toHaveBeenCalledTimes(3);
    oldRequests.forEach((request) => request.resolve(resolved)); await flush(); await flush();
    const result = render(moved);
    expect(result.customers.every((row) => row.administrativeDong === "둔산3동")).toBe(true);
    expect(harness.reverse).toHaveBeenCalledTimes(6);
  });

  it("retains failed rows and retries only unresolved/failed regions, not successes", async () => {
    const source = [customer("A"), customer("B")];
    harness.reverse.mockResolvedValueOnce(resolved).mockRejectedValueOnce(new Error("private provider message"));
    render(source); await flush();
    const failed = render(source);
    expect(failed).toMatchObject({ pendingCount: 0, failedCount: 1 });
    expect(failed.customers).toHaveLength(2);
    expect(customerDirectoryEntry(failed.customers[1]!).dong).toBe("행정동 미확인");
    expect(JSON.stringify(failed)).not.toContain("private provider");
    failed.retry(); render(source); await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(3);
    expect(render(source).failedCount).toBe(0);
  });

  it("keeps empty administrative responses retryable without manufacturing dong data", async () => {
    harness.reverse.mockResolvedValue({ ...resolved, administrativeDong: "" });
    const source = [customer("A")]; render(source); await flush();
    const result = render(source);
    expect(result).toMatchObject({ pendingCount: 0, failedCount: 1 });
    expect(result.customers[0]!.administrativeDong).toBe("");
    expect(result.customers[0]!.deliveryAddress).toBe(source[0]!.deliveryAddress);
  });

  it("retries a failed row without canceling or duplicating an unrelated pending request", async () => {
    const waiting = deferred<typeof resolved>();
    harness.reverse.mockRejectedValueOnce(new Error("temporary failure")).mockReturnValueOnce(waiting.promise);
    const source = [customer("A"), customer("B")]; render(source); await flush();
    const result = render(source);
    expect(result).toMatchObject({ pendingCount: 1, failedCount: 1 });
    result.retry(); await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(3);
    waiting.resolve(resolved); await flush();
    expect(render(source)).toMatchObject({ pendingCount: 0, failedCount: 0 });
    expect(harness.reverse).toHaveBeenCalledTimes(3);
  });

  it("does not reuse cached region metadata after the source address changes at the same pin", async () => {
    const source = [customer("A")]; render(source); await flush();
    const waiting = deferred<typeof resolved>(); harness.reverse.mockReturnValueOnce(waiting.promise);
    const edited = [{ ...source[0]!, deliveryAddress: "대전 서구 새 주소 20" }];
    expect(render(edited).customers[0]!.administrativeDong).toBe(""); await flush();
    expect(harness.reverse).toHaveBeenCalledTimes(2);
    waiting.resolve({ ...resolved, administrativeDong: "둔산3동" }); await flush();
    expect(render(edited).customers[0]!.administrativeDong).toBe("둔산3동");
    expect(render(edited).customers[0]!.deliveryAddress).toBe("대전 서구 새 주소 20");
  });

  it.each(["resolve", "reject"] as const)("ignores %s after unmount and never starts queued calls", async (outcome) => {
    const request = deferred<typeof resolved>(); harness.reverse.mockReturnValue(request.promise);
    render(Array.from({ length: 5 }, (_, index) => customer(String(index)))); await flush();
    unmount(); const writes = harness.writes;
    if (outcome === "resolve") request.resolve(resolved); else request.reject(new Error("late private failure"));
    await flush();
    expect(harness.writes).toBe(writes); expect(harness.reverse).toHaveBeenCalledTimes(3);
  });
});
