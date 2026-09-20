import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryMovementInputSchema, inventoryProductSchema, type InventoryContext, type InventoryLot, type InventoryProductDetail } from "@/domain/inventory";

const harness = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as Array<{ current: unknown }>, stateCursor: 0, refCursor: 0, online: true, movement: vi.fn(), count: vi.fn(), updateLot: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }];
  },
  useRef: (initial: unknown) => { const index = harness.refCursor++; return harness.refs[index] ?? (harness.refs[index] = { current: initial }); },
  useId: () => "inventory-form-test",
  useEffect: () => undefined,
}));
vi.mock("client-only", () => ({}));
vi.mock("./use-inventory-connection", () => ({ useInventoryConnection: () => harness.online, INVENTORY_OFFLINE_DRAFT_MESSAGE: "인터넷이 끊겨 저장할 수 없어요. 이 창의 입력은 유지돼요." }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { movement: harness.movement, count: harness.count, updateLot: harness.updateLot }, inventoryErrorMessage: () => "다시 확인해주세요." }));
import { InventoryCountForm, InventoryLotEditor, InventoryMovementForm } from "./inventory-forms";

const product = inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "가상 품목", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 12, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 2, stockRevision: 3, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 29 }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1" });
const lot: InventoryLot = { lotId: "lot-1", productId: product.productId, locationId: "refrigerated", originLotId: "lot-1", quantity: 29, revision: 1, label: "입고", expiryState: "dated", expiryDate: "2026-09-20", createdAt: product.createdAt, updatedAt: product.updatedAt };
const detail: InventoryProductDetail = { product, lots: [lot] };
const context: InventoryContext = { today: "2026-09-13", canWrite: true, canAdmin: false, cycle: { cycleId: "week-2026-09-07", startDate: "2026-09-07", nextDate: "2026-09-14", weekday: 1 }, settings: { weekday: 1, urgentDays: 7, revision: 0, pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null } };
type NodeProps = Record<string, unknown> & { children?: ReactNode };
function find(node: ReactNode, predicate: (type: unknown, props: NodeProps) => boolean): NodeProps | null {
  if (Array.isArray(node)) { for (const item of node) { const match = find(item, predicate); if (match) return match; } return null; }
  if (!isValidElement<NodeProps>(node)) return null;
  return predicate(node.type, node.props) ? node.props : find(node.props.children, predicate);
}
const noop = () => undefined;
function renderTransfer(onSaved: (product: InventoryProductDetail["product"], detail?: InventoryProductDetail) => void = noop) { harness.stateCursor = 0; harness.refCursor = 0; return InventoryMovementForm({ detail, location: "refrigerated", kind: "transfer", onClose: noop, onSaved }); }
function submit(tree: ReactNode) { (find(tree, (type) => type === "form")!.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: noop }); }
function setQuantity(tree: ReactNode, quantity: number) { (find(tree, (type) => typeof type === "function" && type.name === "QuantityFields")!.onChange as (value: number) => void)(quantity); }
function setDestination(tree: ReactNode, destination: string) { (find(tree, (type, props) => type === "select" && props.value !== "lot-1")!.onChange as (event: { target: { value: string } }) => void)({ target: { value: destination } }); }
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => { harness.states = []; harness.refs = []; harness.stateCursor = 0; harness.refCursor = 0; harness.online = true; harness.movement.mockReset(); harness.count.mockReset(); harness.updateLot.mockReset(); vi.stubGlobal("navigator", { onLine: true }); });
afterEach(() => vi.unstubAllGlobals());
describe("inventory form action safety", () => {
  it("saves expiry edits without a mandatory reason and retains the confirmed detail protocol", async () => {
    const onSaved = vi.fn();
    harness.updateLot.mockResolvedValue({ product, detail, replayed: false });
    const render = () => { harness.stateCursor = 0; harness.refCursor = 0; return InventoryLotEditor({ detail, lot, onClose: noop, onSaved }); };
    let tree = render();
    expect(find(tree, (type) => typeof type === "function" && type.name === "FormFooter")!.disabled).toBe(true);
    submit(tree); await settle(); expect(harness.updateLot).not.toHaveBeenCalled();
    (find(tree, (type) => typeof type === "function" && type.name === "LotFields")!.onChange as (draft: unknown) => void)({ label: lot.label, expiryState: "dated", expiryDate: "2026-09-21" });
    tree = render();
    expect(find(tree, (type) => type === "textarea")).toBeNull();
    submit(tree); await settle();
    expect(harness.updateLot).toHaveBeenCalledOnce();
    expect(harness.updateLot.mock.calls[0]![0]).toMatchObject({ productId: product.productId, lotId: lot.lotId, expectedStockRevision: 3, reason: "", includeDetail: true });
    expect(onSaved).toHaveBeenCalledWith(product, detail);
  });
  it("rejects impossible dates before sending an expiry update", async () => {
    const tree = InventoryLotEditor({ detail, lot: { ...lot, expiryDate: "2026-02-29" }, onClose: noop, onSaved: noop });
    submit(tree); await settle();
    expect(harness.updateLot).not.toHaveBeenCalled();
    expect(find(tree, (type) => typeof type === "function" && type.name === "FormFooter")!.disabled).toBe(true);
  });
  it.each([false, true])("requests an authoritative snapshot but does not reuse it when replayed=%s", async (replayed) => {
    const onSaved = vi.fn();
    harness.movement.mockResolvedValue({ product, detail, replayed });
    let tree = renderTransfer(onSaved); setQuantity(tree, 5); setDestination(tree, "freezer1"); tree = renderTransfer(onSaved);
    expect(onSaved).not.toHaveBeenCalled(); submit(tree); await settle();
    expect(harness.movement.mock.calls[0]![0]).toMatchObject({ quantity: 5, includeDetail: true });
    expect(onSaved).toHaveBeenCalledWith(product, replayed ? undefined : detail);
  });
  it("retains an offline draft in memory but submits nothing until an explicit online retry", async () => {
    harness.movement.mockResolvedValue({ product });
    let tree = renderTransfer(); setQuantity(tree, 7); setDestination(tree, "freezer2");
    harness.online = false; Object.assign(navigator, { onLine: false }); tree = renderTransfer(); submit(tree); await settle();
    expect(harness.movement).not.toHaveBeenCalled();
    tree = renderTransfer(); expect(find(tree, (type) => typeof type === "function" && type.name === "QuantityFields")!.value).toBe(7);
    harness.online = true; Object.assign(navigator, { onLine: true }); tree = renderTransfer();
    expect(harness.movement).not.toHaveBeenCalled(); submit(tree); await settle();
    expect(harness.movement).toHaveBeenCalledOnce();
    expect(harness.movement.mock.calls[0]![0]).toMatchObject({ quantity: 7, toLocationId: "freezer2", expectedStockRevision: 3 });
  });
  it("blocks invalid transfer destinations and submits the exact revisioned transfer contract", async () => {
    harness.movement.mockResolvedValue({ product });
    let tree = renderTransfer(); setQuantity(tree, 5); tree = renderTransfer(); submit(tree);
    expect(harness.movement).not.toHaveBeenCalled();
    setDestination(tree, "refrigerated"); tree = renderTransfer(); submit(tree); expect(harness.movement).not.toHaveBeenCalled();
    setDestination(tree, "freezer1"); tree = renderTransfer(); submit(tree); await settle();
    const input = harness.movement.mock.calls[0]![0];
    expect(inventoryMovementInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({ kind: "transfer", productId: "product-1", locationId: "refrigerated", toLocationId: "freezer1", lotId: "lot-1", quantity: 5, expectedStockRevision: 3 });
    expect(input).not.toHaveProperty("newLot");
  });
  it("deduplicates a double tap and retains the request id for an uncertain transfer retry", async () => {
    let reject!: (cause: unknown) => void;
    harness.movement.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValueOnce({ product });
    let tree = renderTransfer(); setQuantity(tree, 5); setDestination(tree, "sample"); tree = renderTransfer();
    submit(tree); submit(tree); expect(harness.movement).toHaveBeenCalledOnce();
    reject(new Error("network timeout")); await settle();
    tree = renderTransfer(); submit(tree); await settle();
    expect(harness.movement).toHaveBeenCalledTimes(2);
    expect(harness.movement.mock.calls[0]![0].requestId).toBe(harness.movement.mock.calls[1]![0].requestId);
  });
  it("does not move an already-open count draft into a new weekly cycle", () => {
    InventoryCountForm({ detail, location: "refrigerated", context, countMode: true, onClose: noop, onSaved: noop });
    harness.stateCursor = 0; harness.refCursor = 0;
    const tree = InventoryCountForm({ detail, location: "refrigerated", context: { ...context, today: "2026-09-14", cycle: { ...context.cycle, cycleId: "week-2026-09-14", startDate: "2026-09-14", nextDate: "2026-09-21" } }, countMode: true, onClose: noop, onSaved: noop });
    submit(tree); expect(harness.count).not.toHaveBeenCalled();
    expect(find(tree, (_type, props) => props.role === "alert")!.children).toContain("새 실사 기간");
    expect(find(tree, (type) => typeof type === "function" && type.name === "FormFooter")!.disabled).toBe(true);
  });
  it("blocks count submission during context revalidation while keeping quantities read-only", () => {
    const tree = InventoryCountForm({ detail, location: "refrigerated", context, countMode: true, calendarReady: false, onClose: noop, onSaved: noop });
    submit(tree); expect(harness.count).not.toHaveBeenCalled();
    expect(find(tree, (type) => typeof type === "function" && type.name === "QuantityFields")).toBeNull();
    expect(find(tree, (_type, props) => props["aria-label"] === "확인할 유통기한별 재고")).not.toBeNull();
  });

  it.each([undefined, false])("blocks read-only confirmation when the personal count mode is %s", (countMode) => {
    const tree = InventoryCountForm({ detail, location: "refrigerated", context, ...(countMode === undefined ? {} : { countMode }), onClose: noop, onSaved: noop });
    submit(tree); expect(harness.count).not.toHaveBeenCalled();
    expect(find(tree, (type) => typeof type === "function" && type.name === "FormFooter")!.disabled).toBe(true);
  });

  it("submits unchanged quantities for every positive lot only, as a server-verified match", async () => {
    const onSaved = vi.fn();
    const rows = [{ ...lot, quantity: 19 }, { ...lot, lotId: "lot-2", quantity: 10 }, { ...lot, lotId: "lot-empty", quantity: 0 }, { ...lot, lotId: "other-place", quantity: 4, locationId: "sample" as const }];
    harness.count.mockResolvedValue({ product, detail: { product, lots: rows }, replayed: false });
    const tree = InventoryCountForm({ detail: { product, lots: rows }, location: "refrigerated", context, countMode: true, onClose: noop, onSaved });
    expect(find(tree, (type) => type === "input" || type === "textarea")).toBeNull();
    expect(find(tree, (type) => typeof type === "function" && type.name === "FormFooter")!.label).toBe("수량 일치 · 실사 완료");
    submit(tree); await settle();
    expect(harness.count).toHaveBeenCalledOnce();
    expect(harness.count.mock.calls[0]![0]).toMatchObject({ counts: [{ lotId: "lot-1", quantity: 19 }, { lotId: "lot-2", quantity: 10 }], matchOnly: true, reason: "", includeDetail: true, cycleId: context.cycle.cycleId, expectedStockRevision: 3 });
    expect(onSaved).toHaveBeenCalledWith(product, { product, lots: rows });
  });

  it("allows an explicit zero-stock match but never treats missing positive lots as zero", async () => {
    harness.count.mockResolvedValue({ product });
    const tree = InventoryCountForm({ detail: { product: { ...product, quantityByLocation: inventoryLocationMap(0) }, lots: [] }, location: "refrigerated", context, countMode: true, onClose: noop, onSaved: noop });
    submit(tree); await settle();
    expect(harness.count.mock.calls[0]![0]).toMatchObject({ counts: [], matchOnly: true });
    harness.stateCursor = 0; harness.refCursor = 0;
    const missing = InventoryCountForm({ detail: { product, lots: [] }, location: "refrigerated", context, countMode: true, onClose: noop, onSaved: noop });
    submit(missing); expect(harness.count).toHaveBeenCalledOnce();
  });

  it("stops an already-open match when count mode turns off", () => {
    InventoryCountForm({ detail, location: "refrigerated", context, countMode: true, onClose: noop, onSaved: noop });
    harness.stateCursor = 0; harness.refCursor = 0;
    const tree = InventoryCountForm({ detail, location: "refrigerated", context, countMode: false, onClose: noop, onSaved: noop });
    submit(tree); expect(harness.count).not.toHaveBeenCalled();
  });

  it.each(["receive", "issue", "adjust"] as const)("targets the specified lot for %s and submits no reason", async (kind) => {
    const second = { ...lot, lotId: "lot-second", quantity: 6 };
    const render = () => { harness.stateCursor = 0; harness.refCursor = 0; return InventoryMovementForm({ detail: { product, lots: [lot, second] }, location: "refrigerated", kind, initialLotId: second.lotId, inspectionCycleId: context.cycle.cycleId, onClose: noop, onSaved: noop }); };
    harness.movement.mockResolvedValue({ product });
    let tree = render();
    expect(find(tree, (type) => type === "textarea" || type === "select")).toBeNull();
    expect(find(tree, (type) => typeof type === "function" && type.name === "LotFields")).toBeNull();
    if (kind === "adjust") expect(find(tree, (type) => typeof type === "function" && type.name === "QuantityFields")!.value).toBe(6);
    else expect(find(tree, (type) => typeof type === "function" && type.name === "QuantityFields")!.value).toBeNaN();
    setQuantity(tree, 3); tree = render(); submit(tree); await settle();
    expect(harness.movement.mock.calls[0]![0]).toMatchObject({ lotId: second.lotId, quantity: 3, kind, reason: "", inspectionCycleId: context.cycle.cycleId });
    expect(harness.movement.mock.calls[0]![0]).not.toHaveProperty("newLot");
  });

  it.each(["missing", "different-place"])("does not silently redirect an invalid selected lot %s", (initialLotId) => {
    const render = () => { harness.stateCursor = 0; harness.refCursor = 0; return InventoryMovementForm({ detail: { product, lots: [lot, { ...lot, lotId: "different-place", locationId: "sample" }] }, location: "refrigerated", kind: "receive", initialLotId, onClose: noop, onSaved: noop }); };
    let tree = render(); setQuantity(tree, 3); tree = render(); submit(tree);
    expect(harness.movement).not.toHaveBeenCalled();
  });

  it("preserves not-applicable metadata until the employee explicitly changes its status", async () => {
    harness.updateLot.mockResolvedValue({ product });
    const legacy = { ...lot, expiryState: "not_applicable" as const, expiryDate: null };
    const render = () => { harness.stateCursor = 0; harness.refCursor = 0; return InventoryLotEditor({ detail, lot: legacy, onClose: noop, onSaved: noop }); };
    let tree = render();
    submit(tree); await settle(); expect(harness.updateLot).not.toHaveBeenCalled();
    (find(tree, (type) => typeof type === "function" && type.name === "LotFields")!.onChange as (draft: unknown) => void)({ label: "구분명 수정", expiryState: "not_applicable", expiryDate: null });
    tree = render(); submit(tree); await settle();
    expect(harness.updateLot.mock.calls[0]![0].draft).toMatchObject({ expiryState: "not_applicable", expiryDate: null });
    tree = render();
    (find(tree, (type) => typeof type === "function" && type.name === "LotFields")!.onChange as (draft: unknown) => void)({ label: lot.label, expiryState: "unknown", expiryDate: null });
    submit(render()); await settle();
    expect(harness.updateLot.mock.calls[1]![0].draft).toMatchObject({ expiryState: "unknown", expiryDate: null });
  });

  it("passes the exact lot into actions, but blocks them while expiry changes are unsaved", () => {
    const onMovement = vi.fn();
    const render = () => { harness.stateCursor = 0; harness.refCursor = 0; return InventoryLotEditor({ detail, lot, onClose: noop, onSaved: noop, onMovement }); };
    let tree = render();
    const action = (node: ReactNode) => find(node, (_type, props) => Array.isArray(props.children) && props.children.includes("입고"))!;
    (action(tree).onClick as () => void)(); expect(onMovement).toHaveBeenCalledWith("receive", lot.lotId);
    (find(tree, (type) => typeof type === "function" && type.name === "LotFields")!.onChange as (draft: unknown) => void)({ label: lot.label, expiryState: "dated", expiryDate: "2026-09-21" });
    tree = render(); expect(action(tree).disabled).toBe(true);
    (action(tree).onClick as () => void)(); expect(onMovement).toHaveBeenCalledOnce();
  });
});
