import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryContext, type InventoryProduct, type InventoryProductDetail } from "@/domain/inventory";

type Effect = { effect: () => void | (() => void); deps?: unknown[] | undefined };
const harness = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as Array<{ current: unknown }>, stateCursor: 0, refCursor: 0,
  effects: [] as Effect[], previous: [] as Array<{ deps?: unknown[] | undefined; cleanup?: (() => void) | undefined }>, detail: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = harness.stateCursor++; if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }]; },
  useRef: (initial: unknown) => { const index = harness.refCursor++; return harness.refs[index] ?? (harness.refs[index] = { current: initial }); },
  useEffect: (effect: Effect["effect"], deps?: unknown[]) => harness.effects.push({ effect, deps }),
}));
vi.mock("client-only", () => ({}));
vi.mock("./use-inventory-connection", () => ({ useInventoryConnection: () => true }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { detail: harness.detail }, inventoryErrorMessage: () => "최신 정보를 다시 확인해주세요." }));
import { InventoryDetail } from "./inventory-detail";

type Props = Record<string, unknown> & { children?: ReactNode };
function find(node: ReactNode, predicate: (props: Props) => boolean): Props | null {
  if (Array.isArray(node)) { for (const item of node) { const match = find(item, predicate); if (match) return match; } return null; }
  if (!isValidElement<Props>(node)) return null;
  return predicate(node.props) ? node.props : find(node.props.children, predicate);
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<Props>(node) ? text(node.props.children) : "";
}
function click(tree: ReactNode, label: string) { (find(tree, (props) => typeof props.onClick === "function" && text(props.children) === label)!.onClick as () => void)(); }
const onSaved = vi.fn(); const onClose = vi.fn();
const context = { canWrite: true, canAdmin: true, today: "2026-09-13", settings: { urgentDays: 100 }, cycle: { cycleId: "week-2026-09-11" } } as InventoryContext;
function snapshot(quantity = 10, stockRevision = 1): InventoryProductDetail {
  const product = inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "검증 품목", manufacturer: "", specification: "", origin: "", note: "", unitLabel: "봉", unitsPerBox: 1,
    defaultLocationId: "refrigerated", urgent: false, status: "active", revision: 1, stockRevision, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: quantity }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null,
    createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z", createdBy: "EMP", updatedBy: "EMP" });
  return { product, lots: [] };
}
function render(callback = onSaved) {
  harness.stateCursor = 0; harness.refCursor = 0; harness.effects = [];
  return InventoryDetail({ productId: "product-1", initialLocation: "refrigerated", context, onSaved: callback, onClose });
}
function effects() {
  harness.effects.forEach(({ effect, deps }, index) => {
    const prior = harness.previous[index];
    if (!prior || !deps || deps.length !== prior.deps?.length || deps.some((value, position) => !Object.is(value, prior.deps?.[position]))) {
      prior?.cleanup?.(); const cleanup = effect(); harness.previous[index] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
    }
  });
}
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
async function open() { harness.detail.mockResolvedValueOnce(snapshot()); render(); effects(); await settle(); return render(); }
function saveHandler(tree: ReactNode) {
  click(tree, "입고"); const form = find(render(), (props) => props.kind === "receive" && typeof props.onSaved === "function")!;
  return form.onSaved as (product: InventoryProduct, confirmed?: InventoryProductDetail) => void;
}
beforeEach(() => { harness.states = []; harness.refs = []; harness.effects = []; harness.previous = []; harness.stateCursor = 0; harness.refCursor = 0; harness.detail.mockReset(); onSaved.mockReset(); onClose.mockReset(); });

describe("inventory detail save reconciliation", () => {
  it("does not report ordinary initial reads as new saves", async () => {
    await open(); expect(harness.detail).toHaveBeenCalledOnce(); expect(onSaved).not.toHaveBeenCalled();
  });
  it("applies a matching commit-confirmed snapshot immediately with no extra read", async () => {
    const save = saveHandler(await open()); const next = snapshot(12, 2);
    save(next.product, next); render(); effects(); await settle();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(next.product); expect(harness.detail).toHaveBeenCalledOnce();
    expect(harness.states[0]).toEqual(next); expect(harness.states[2]).toBe(false);
  });
  it("never publishes an old replay product and publishes the fresh read to both detail and list", async () => {
    const save = saveHandler(await open()); const replay = snapshot(12, 2); const latest = snapshot(5, 3);
    let resolve!: (result: InventoryProductDetail) => void; harness.detail.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    save(replay.product); expect(onSaved).not.toHaveBeenCalled(); expect(harness.states[2]).toBe(true);
    render(); effects(); resolve(latest); await settle();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(latest.product); expect(harness.states[0]).toEqual(latest);
    expect(onSaved).not.toHaveBeenCalledWith(replay.product);
  });
  it("keeps the prior list untouched if the fresh read fails, then reconciles on explicit retry", async () => {
    const save = saveHandler(await open()); const replay = snapshot(12, 2); const latest = snapshot(4, 4);
    harness.detail.mockRejectedValueOnce(new Error("offline")); save(replay.product); render(); effects(); await settle();
    expect(onSaved).not.toHaveBeenCalled(); expect(harness.states[0]).toBeNull(); expect(harness.states[2]).toBe(false);
    harness.detail.mockResolvedValueOnce(latest); click(render(), "다시 확인"); render(); effects(); await settle();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(latest.product); expect(harness.states[0]).toEqual(latest);
  });
  it("revalidates a mismatched expanded snapshot rather than publishing its product or lots", async () => {
    const save = saveHandler(await open()); const product = snapshot(12, 2).product; const mismatched = snapshot(7, 3); const latest = snapshot(6, 4);
    harness.detail.mockResolvedValueOnce(latest); save(product, mismatched); expect(onSaved).not.toHaveBeenCalled(); render(); effects(); await settle();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(latest.product);
  });
  it("ignores a late fetch superseded by a newer confirmed save", async () => {
    const save = saveHandler(await open()); let resolve!: (result: InventoryProductDetail) => void;
    harness.detail.mockReturnValueOnce(new Promise((done) => { resolve = done; })); save(snapshot(12, 2).product); render(); effects();
    const latest = snapshot(4, 4); save(latest.product, latest); resolve(snapshot(8, 3)); await settle();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(latest.product); expect(harness.states[0]).toEqual(latest);
  });
  it("uses the latest parent callback without causing another detail request", async () => {
    const save = saveHandler(await open()); let resolve!: (result: InventoryProductDetail) => void;
    harness.detail.mockReturnValueOnce(new Promise((done) => { resolve = done; })); save(snapshot(12, 2).product); render(); effects();
    const latestCallback = vi.fn(); render(latestCallback); effects(); const latest = snapshot(8, 3); resolve(latest); await settle();
    expect(onSaved).not.toHaveBeenCalled(); expect(latestCallback).toHaveBeenCalledExactlyOnceWith(latest.product); expect(harness.detail).toHaveBeenCalledTimes(2);
  });
  it("does not publish a dismissed pending refresh", async () => {
    const save = saveHandler(await open()); let resolve!: (result: InventoryProductDetail) => void;
    harness.detail.mockReturnValueOnce(new Promise((done) => { resolve = done; })); save(snapshot(12, 2).product); render(); effects();
    harness.previous.forEach((effect) => effect.cleanup?.()); resolve(snapshot(8, 3)); await settle(); expect(onSaved).not.toHaveBeenCalled();
  });
  it("immediately removes confirmed deletions without attempting to read a tombstone", async () => {
    const save = saveHandler(await open()); const deleted = { ...snapshot().product, status: "deleted" as const }; save(deleted);
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(deleted); expect(onClose).toHaveBeenCalledOnce();
    expect(harness.detail).toHaveBeenCalledOnce();
  });
});
