import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { inventoryLocationMap, type InventoryContext, type InventoryProduct } from "@/domain/inventory";
import { clearInventoryWorkspaceSnapshot, updateInventoryWorkspaceUi } from "./inventory-workspace-snapshot";

const harness = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as Array<{ current: unknown }>, effects: [] as Array<() => void | (() => void)>, stateCursor: 0, refCursor: 0, online: true, context: vi.fn(), list: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = harness.stateCursor++; if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial; return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }]; },
  useRef: (initial: unknown) => { const index = harness.refCursor++; return harness.refs[index] ?? (harness.refs[index] = { current: initial }); },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
  useLayoutEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
  useMemo: (factory: () => unknown) => factory(), useCallback: (callback: unknown) => callback,
}));
vi.mock("client-only", () => ({}));
vi.mock("./use-inventory-connection", () => ({ useInventoryConnection: () => harness.online, INVENTORY_OFFLINE_DRAFT_MESSAGE: "입력은 유지되며 연결된 뒤 다시 저장해주세요." }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { context: harness.context, list: harness.list }, inventoryErrorMessage: () => "최신 정보 확인이 필요해요." }));
import { InventoryWorkspace } from "./inventory-workspace";

const context: InventoryContext = { today: "2026-09-13", canWrite: true, canAdmin: false, cycle: { cycleId: "week-2026-09-07", startDate: "2026-09-07", nextDate: "2026-09-14", weekday: 1 }, settings: { weekday: 1, urgentDays: 7, revision: 0, pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null } };
const session = { uid: "employee-1", displayName: "가상 직원", claims: { roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1 } } as AuthenticatedSession;
const windowEvents = new Map<string, () => void>();
const documentEvents = new Map<string, () => void>();
type Props = Record<string, unknown> & { children?: ReactNode };
function find(node: ReactNode, predicate: (type: unknown, props: Props) => boolean): Props | null {
  if (Array.isArray(node)) { for (const item of node) { const found = find(item, predicate); if (found) return found; } return null; }
  if (!isValidElement<Props>(node)) return null;
  return predicate(node.type, node.props) ? node.props : find(node.props.children, predicate);
}
function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return isValidElement<Props>(node) ? textContent(node.props.children) : "";
}
function render(admin = false) { harness.stateCursor = 0; harness.refCursor = 0; harness.effects = []; return InventoryWorkspace({ session, admin }); }
function resetMountedInstance() { harness.states = []; harness.refs = []; harness.effects = []; }
async function settle() { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }
const hasEditor = (tree: ReactNode) => find(tree, (type) => typeof type === "function" && type.name === "InventoryProductEditor") !== null;
beforeEach(() => {
  clearInventoryWorkspaceSnapshot();
  harness.states = []; harness.refs = []; harness.effects = []; harness.online = true; windowEvents.clear(); documentEvents.clear();
  harness.context.mockReset().mockResolvedValue(context); harness.list.mockReset().mockResolvedValue([]);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: (name: string, callback: () => void) => documentEvents.set(name, callback), removeEventListener: (name: string) => documentEvents.delete(name) });
  vi.stubGlobal("window", { addEventListener: (name: string, callback: () => void) => windowEvents.set(name, callback), removeEventListener: (name: string) => windowEvents.delete(name) });
});
afterEach(() => { clearInventoryWorkspaceSnapshot(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function openEditor() {
  render(); const cleanup = harness.effects[0]!() as () => void; await settle();
  const tree = render();
  const button = find(tree, (_type, props) => props["aria-label"] === "새 품목 등록");
  (button!.onClick as () => void)(); expect(hasEditor(render())).toBe(true);
  return cleanup;
}
describe("inventory in-memory draft lifecycle", () => {
  it("publishes the first page before the full cold catalog completes and carries progress across re-entry", async () => {
    const first = { productId: "first-page", name: "첫 페이지 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1,
      createdAt: "2026-09-06T00:00:00Z", defaultLocationId: "refrigerated", quantityByLocation: inventoryLocationMap(0),
      nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    const second = { ...first, productId: "second-page", name: "다음 페이지 품목" };
    let push!: (products: InventoryProduct[], progress: { pageCount: number; complete: boolean }) => void;
    let finish!: () => void;
    harness.list.mockImplementation((onProgress?: typeof push) => new Promise<InventoryProduct[]>((resolve) => {
      push = onProgress!;
      push([first], { pageCount: 1, complete: false });
      finish = () => { push([first, second], { pageCount: 2, complete: true }); resolve([first, second]); };
    }));

    render(); const firstCleanup = harness.effects[0]!() as () => void; await settle();
    expect(harness.states[1]).toEqual([first]);
    expect(harness.states[2]).toBe(false);
    firstCleanup();

    resetMountedInstance();
    render();
    expect(harness.states[1]).toEqual([first]);
    expect(harness.states[2]).toBe(false);
    const secondCleanup = harness.effects[0]!() as () => void; await settle();
    expect(harness.list).toHaveBeenCalledOnce();
    finish(); await settle();
    expect(harness.states[1]).toEqual([first, second]);
    secondCleanup();
  });

  it("keeps a published first page when a later page fails", async () => {
    const first = { productId: "first-page", name: "첫 페이지 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1,
      createdAt: "2026-09-06T00:00:00Z", defaultLocationId: "refrigerated", quantityByLocation: inventoryLocationMap(0),
      nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    harness.list.mockImplementation(async (onProgress?: (products: InventoryProduct[], progress: { pageCount: number; complete: boolean }) => void) => {
      onProgress?.([first], { pageCount: 1, complete: false });
      throw new Error("page 2 unavailable");
    });

    render(); const cleanup = harness.effects[0]!() as () => void; await settle();
    expect(harness.states[1]).toEqual([first]);
    expect(harness.states[2]).toBe(false);
    expect(harness.states[18]).toMatchObject({ status: "stale-error" });
    cleanup();
  });

  it("discards a published page when a later page reports an authorization failure", async () => {
    const first = { productId: "private-first-page", name: "권한 폐기 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1,
      createdAt: "2026-09-06T00:00:00Z", defaultLocationId: "refrigerated", quantityByLocation: inventoryLocationMap(0),
      nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    harness.list.mockImplementation(async (onProgress?: (products: InventoryProduct[], progress: { pageCount: number; complete: boolean }) => void) => {
      onProgress?.([first], { pageCount: 1, complete: false });
      throw { code: "functions/permission-denied" };
    });

    render(); const cleanup = harness.effects[0]!() as () => void; await settle();
    expect(harness.states[0]).toBeNull();
    expect(harness.states[1]).toEqual([]);
    expect(harness.states[2]).toBe(false);
    cleanup();
  });

  it("shows a warm catalog immediately, skips reads inside TTL, then revalidates in background after TTL", async () => {
    const product = { productId: "warm-product", name: "복원 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1,
      createdAt: "2026-09-06T00:00:00Z", defaultLocationId: "refrigerated", quantityByLocation: inventoryLocationMap(0),
      nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    harness.list.mockResolvedValue([product]);
    render(); const coldCleanup = harness.effects[0]!() as () => void; await settle(); coldCleanup();

    resetMountedInstance();
    render();
    expect(harness.states[1]).toEqual([product]);
    expect(harness.states[2]).toBe(false);
    const warmCleanup = harness.effects[0]!() as () => void; await settle();
    expect(harness.list).toHaveBeenCalledTimes(1);
    warmCleanup();

    now.mockReturnValue(161_000);
    resetMountedInstance();
    render();
    expect(harness.states[1]).toEqual([product]);
    const staleCleanup = harness.effects[0]!() as () => void; await settle();
    expect(harness.list).toHaveBeenCalledTimes(2);
    staleCleanup(); now.mockRestore();
  });

  it("restores inventory list controls and a committed write on re-entry", async () => {
    const original = { productId: "saved-product", name: "기존 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1,
      createdAt: "2026-09-06T00:00:00Z", defaultLocationId: "freezer1", quantityByLocation: inventoryLocationMap(0),
      nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    harness.list.mockResolvedValue([original]);
    const cleanup = await openEditor();
    const editor = find(render(), (type) => typeof type === "function" && type.name === "InventoryProductEditor")!;
    const saved = { ...original, name: "최신 품목", revision: 2 };
    (editor.onSaved as (product: InventoryProduct) => void)(saved);
    updateInventoryWorkspaceUi("employee-1:1:1", { location: "freezer1", query: "최신", urgentOnly: true, showInactive: true, limit: 180, scrollTop: 700 });
    cleanup();

    resetMountedInstance();
    render();
    expect(harness.states[1]).toEqual([saved]);
    expect(harness.states.slice(5, 9)).toEqual(["freezer1", "최신", true, 180]);
    expect(harness.states[12]).toBe(true);
  });
  it("keeps count mode off until this employee enables it and disables toggling while offline", async () => {
    const cleanup = await openEditor();
    const toggle = () => find(render(), (_type, props) => props.role === "switch" && props["aria-label"] === "재고조사 모드");
    expect(toggle()?.checked).toBe(false);
    (toggle()!.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    expect(toggle()?.checked).toBe(true);
    expect(find(render(), (type) => type === "progress")).toBeNull();
    expect(harness.list).toHaveBeenCalledTimes(1);
    harness.online = false;
    expect(toggle()?.disabled).toBe(true);
    expect(hasEditor(render())).toBe(true);
    cleanup();
  });
  it("keeps search and all list options across opening and closing the options sheet", async () => {
    const cleanup = await openEditor();
    let tree = render();
    const trigger = find(tree, (_type, props) => props["aria-label"] === "목록 옵션")!;
    expect(trigger).toMatchObject({ "aria-expanded": false });
    (trigger.onClick as () => void)(); tree = render();
    expect(find(tree, (_type, props) => props.title === "목록 옵션")?.open).toBe(true);
    const search = find(tree, (type, props) => type === "input" && props["aria-label"] === "품목 검색")!;
    (search.onChange as (event: { target: { value: string } }) => void)({ target: { value: "닭" } });
    const urgent = find(tree, (type, props) => type === "label" && textContent(props.children).includes("임박 상품만 보기"))!;
    const urgentInput = find(urgent.children, (type) => type === "input")!;
    (urgentInput.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    const inactive = find(tree, (type, props) => type === "label" && textContent(props.children).includes("비활성 품목 보기"))!;
    const inactiveInput = find(inactive.children, (type) => type === "input")!;
    (inactiveInput.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    const count = find(tree, (_type, props) => props.role === "switch" && props["aria-label"] === "재고조사 모드")!;
    (count.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = render();
    const sheet = find(tree, (_type, props) => props.title === "목록 옵션")!;
    (sheet.onClose as () => void)(); tree = render();
    expect(find(tree, (type, props) => type === "input" && props["aria-label"] === "품목 검색")?.value).toBe("닭");
    expect(find(tree, (_type, props) => props["aria-label"] === "목록 옵션")).toMatchObject({ "aria-expanded": false, "data-active": true });
    expect(find(tree, (_type, props) => props.role === "status" && textContent(props.children) === "재고조사 ON")).not.toBeNull();
    const reopen = find(tree, (_type, props) => props["aria-label"] === "목록 옵션")!;
    (reopen.onClick as () => void)(); tree = render();
    const restoredInactive = find(tree, (type, props) => type === "label" && textContent(props.children).includes("비활성 품목 보기"))!;
    const restoredUrgent = find(tree, (type, props) => type === "label" && textContent(props.children).includes("임박 상품만 보기"))!;
    expect(find(restoredInactive.children, (type) => type === "input")?.checked).toBe(true);
    expect(find(restoredUrgent.children, (type) => type === "input")?.checked).toBe(true);
    expect(find(tree, (_type, props) => props.role === "switch" && props["aria-label"] === "재고조사 모드")?.checked).toBe(true);
    cleanup();
  });
  it("omits an empty 0/0 progress card for new products but keeps eligible count progress", async () => {
    const product = { productId: "new-product", name: "새 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1,
      createdAt: "2026-09-13T00:00:00Z", defaultLocationId: "refrigerated", quantityByLocation: inventoryLocationMap(0),
      nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    harness.list.mockResolvedValue([product]);
    const cleanup = await openEditor();
    const toggle = find(render(), (_type, props) => props.role === "switch" && props["aria-label"] === "재고조사 모드")!;
    (toggle.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    expect(find(render(), (type) => type === "progress")).toBeNull();
    harness.list.mockResolvedValue([{ ...product, createdAt: "2026-09-06T00:00:00Z" }]);
    harness.online = false; Object.assign(navigator, { onLine: false }); windowEvents.get("offline")!();
    harness.online = true; Object.assign(navigator, { onLine: true });
    windowEvents.get("online")!(); await settle();
    expect(find(render(), (_type, props) => props["aria-label"] === "재고조사 모드")?.checked).toBe(true);
    expect(find(render(), (type) => type === "progress")).toMatchObject({ max: 1, value: 0 });
    cleanup();
  });
  it("hides confirmation after 3.4 seconds and never lets an old timer hide a newer save", async () => {
    vi.useFakeTimers();
    const cleanup = await openEditor();
    const editor = find(render(), (type) => typeof type === "function" && type.name === "InventoryProductEditor")!;
    const product = { productId: "notice-product", name: "알림 검증 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1, defaultLocationId: "refrigerated", quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    (editor.onSaved as (product: InventoryProduct) => void)(product);
    render(); const oldTimerCleanup = harness.effects.at(-1)!() as () => void;
    vi.advanceTimersByTime(2_000);
    (editor.onSaved as (product: InventoryProduct) => void)({ ...product, revision: 2 });
    render(); const newTimerCleanup = harness.effects.at(-1)!() as () => void;
    vi.advanceTimersByTime(1_400);
    const message = () => find(render(), (_type, props) => props.role === "status" && props.children === "재고 정보를 저장했어요.");
    expect(message()).not.toBeNull();
    vi.advanceTimersByTime(2_000); expect(message()).toBeNull();
    oldTimerCleanup(); newTimerCleanup(); cleanup();
  });
  it("lets an inventory-writing employee find inactive products without exposing settings", async () => {
    const cleanup = await openEditor();
    const tree = render();
    expect(find(tree, (type, props) => type === "label" && textContent(props.children).includes("비활성 품목 보기"))).not.toBeNull();
    expect(find(tree, (_type, props) => props["aria-label"] === "재고 설정")).toBeNull(); cleanup();
  });
  it("refreshes on return only when stale, without recurring full-list polling or dropping a draft", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    const cleanup = await openEditor();
    documentEvents.get("visibilitychange")!(); await settle();
    expect(harness.list).toHaveBeenCalledTimes(1);
    now.mockReturnValue(161_000); documentEvents.get("visibilitychange")!(); await settle();
    expect(harness.list).toHaveBeenCalledTimes(2); expect(hasEditor(render())).toBe(true);
    documentEvents.get("visibilitychange")!(); await settle();
    expect(harness.list).toHaveBeenCalledTimes(2); cleanup(); now.mockRestore();
  });
  it("coalesces focus, visibility, and online bursts after one stale refresh", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    const cleanup = await openEditor();
    now.mockReturnValue(161_000);
    documentEvents.get("visibilitychange")!(); await settle();
    windowEvents.get("focus")!(); windowEvents.get("online")!(); await settle();
    expect(harness.list).toHaveBeenCalledTimes(2);
    cleanup(); now.mockRestore();
  });
  it("keeps the existing catalog and reports stale freshness after a background failure", async () => {
    const product = { productId: "kept-product", name: "유지 품목", unitLabel: "봉", status: "active", revision: 1, stockRevision: 1,
      createdAt: "2026-09-06T00:00:00Z", defaultLocationId: "refrigerated", quantityByLocation: inventoryLocationMap(0),
      nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct;
    harness.list.mockResolvedValueOnce([product]);
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    render(); const cleanup = harness.effects[0]!() as () => void; await settle();
    harness.context.mockRejectedValueOnce({ code: "functions/unavailable" });
    now.mockReturnValue(161_000); documentEvents.get("visibilitychange")!(); await settle();
    const tree = render();
    expect(find(tree, (_type, props) => props["data-freshness"] === "stale-error")?.children).toContain("갱신 실패 · 기존 정보 표시");
    expect(harness.states[1]).toEqual([product]);
    cleanup(); now.mockRestore();
  });
  it("reuses the shell page gutter only outside the already-padded administrator layout", () => {
    const workspace = render();
    expect(workspace.props.className.split(/\s+/)).toContain("shell-page");
    const adminWorkspace = render(true);
    expect(adminWorkspace.props.className.split(/\s+/)).not.toContain("shell-page");
    expect(adminWorkspace.props["data-admin"]).toBe(true);
  });
  it("keeps an open editor mounted across a temporary disconnect and an online refresh", async () => {
    const cleanup = await openEditor();
    harness.online = false; Object.assign(navigator, { onLine: false }); windowEvents.get("offline")!();
    expect(hasEditor(render())).toBe(true); expect(harness.states[0]).toEqual(context);
    harness.online = true; Object.assign(navigator, { onLine: true }); windowEvents.get("online")!(); await settle();
    expect(hasEditor(render())).toBe(true); expect(harness.list).toHaveBeenCalledTimes(2); cleanup();
  });
  it("keeps a draft when reconnecting fails, but marks its calendar context as unverified", async () => {
    const cleanup = await openEditor();
    harness.online = false; Object.assign(navigator, { onLine: false }); windowEvents.get("offline")!();
    harness.online = true; Object.assign(navigator, { onLine: true });
    harness.context.mockRejectedValueOnce({ code: "functions/unavailable" }); windowEvents.get("online")!(); await settle();
    const tree = render(); expect(hasEditor(tree)).toBe(true);
    expect(find(tree, (_type, props) => props.role === "alert")).not.toBeNull();
    cleanup();
  });
  it("disposes records and the editor after an authorization failure", async () => {
    const cleanup = await openEditor();
    harness.online = false; Object.assign(navigator, { onLine: false }); windowEvents.get("offline")!();
    harness.online = true; Object.assign(navigator, { onLine: true });
    harness.context.mockRejectedValueOnce({ code: "functions/permission-denied" }); windowEvents.get("online")!(); await settle();
    expect(hasEditor(render())).toBe(false); expect(harness.states[0]).toBeNull(); cleanup();
  });
});
