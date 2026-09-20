import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryContext, type InventoryProductDetail } from "@/domain/inventory";

const harness = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, refs: [] as Array<{ current: unknown }>, refCursor: 0, effects: [] as Array<{ run: () => void | (() => void); deps: unknown[] }>, detail: vi.fn(), saved: vi.fn(), close: vi.fn(), online: true }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = harness.cursor++; if (!(index in harness.states)) harness.states[index] = initial; return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }]; },
  useRef: (initial: unknown) => { const index = harness.refCursor++; return harness.refs[index] ?? (harness.refs[index] = { current: initial }); },
  useEffect: (run: () => void | (() => void), deps: unknown[]) => harness.effects.push({ run, deps }),
}));
vi.mock("client-only", () => ({}));
vi.mock("./use-inventory-connection", () => ({ useInventoryConnection: () => harness.online }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { detail: harness.detail }, inventoryErrorMessage: () => "다시 확인해주세요." }));
import { InventoryDetail } from "./inventory-detail";

const product = inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "검증용 만두", manufacturer: "온누리", specification: "1kg", origin: "국내산", unitLabel: "봉", unitsPerBox: 12, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 3, stockRevision: 1, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 29 }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1" });
const detail: InventoryProductDetail = { product, lots: [{ lotId: "lot-1", productId: product.productId, originLotId: "lot-1", locationId: "refrigerated", label: "", expiryState: "dated", expiryDate: "2026-12-01", quantity: 29, revision: 1, createdAt: product.createdAt, updatedAt: product.updatedAt }] };
const context: InventoryContext = { canWrite: true, canAdmin: false, today: "2026-09-13", cycle: { cycleId: "week-2026-09-11", weekday: 5, startDate: "2026-09-11", nextDate: "2026-09-18" }, settings: { urgentDays: 100, weekday: 5, revision: 0, pendingWeekday: null, effectiveDate: null, updatedAt: null, updatedBy: null } };
type Props = Record<string, unknown> & { children?: ReactNode };
function find(node: ReactNode, predicate: (type: unknown, props: Props) => boolean): Props | null {
  if (Array.isArray(node)) { for (const item of node) { const found = find(item, predicate); if (found) return found; } return null; }
  if (!isValidElement<Props>(node)) return null;
  return predicate(node.type, node.props) ? node.props : find(node.props.children, predicate);
}
function text(node: ReactNode): string { return Array.isArray(node) ? node.map(text).join("") : isValidElement<Props>(node) ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""; }
const button = (tree: ReactNode, label: string) => find(tree, (type, props) => typeof type === "function" && type.name === "GlassButton" && (props["aria-label"] ?? text(props.children)) === label);
type Options = { countMode?: boolean; calendarReady?: boolean };
function render(nextContext = context, options: Options = {}) { harness.cursor = 0; harness.refCursor = 0; harness.effects = []; return InventoryDetail({ productId: product.productId, initialLocation: "refrigerated", context: nextContext, ...options, onClose: harness.close, onSaved: harness.saved }); }
const detailEffect = () => harness.effects.find(({ deps }) => deps[0] === product.productId)!;
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
async function load(nextDetail = detail, nextContext = context, options: Options = {}) { harness.detail.mockResolvedValueOnce(nextDetail); render(nextContext, options); harness.effects.forEach(({ run }) => run()); await settle(); return render(nextContext, options); }
function more(tree: ReactNode, nextContext = context, options: Options = {}) { (button(tree, "더보기")!.onClick as () => void)(); return render(nextContext, options); }
beforeEach(() => { harness.states = []; harness.cursor = 0; harness.refs = []; harness.refCursor = 0; harness.effects = []; harness.detail.mockReset(); harness.saved.mockReset(); harness.close.mockReset(); harness.online = true; });

describe("compact inventory detail actions", () => {
  it("shows four frequent actions then count/more without exposing history or destructive actions", async () => {
    const tree = await load();
    for (const label of ["출고", "입고", "조정", "수량 일치 확인", "품목 정보 수정", "더보기"]) expect(button(tree, label)).not.toBeNull();
    for (const label of ["입출고·실사 이력", "비활성화", "품목 삭제"]) expect(button(tree, label)).toBeNull();
    expect(button(tree, "보관 장소 이동")).toBeNull(); expect(button(tree, "계산기")).toBeNull();
    expect(text(tree)).not.toContain("박스"); expect(text(tree)).toContain("29봉");
  });

  it("never exposes write/admin controls to a read-only employee", async () => {
    const tree = await load(detail, { ...context, canWrite: false });
    for (const label of ["출고", "입고", "조정", "수량 일치 확인", "품목 정보 수정", "비활성화", "품목 삭제"]) expect(button(tree, label)).toBeNull();
    const menu = more(tree, { ...context, canWrite: false });
    expect(button(menu, "입출고·실사 이력")).not.toBeNull();
    expect(button(menu, "비활성화")).toBeNull(); expect(button(menu, "품목 삭제")).toBeNull();
  });

  it("allows writing employees to manage products without hiding actions for stock or history", async () => {
    const tree = more(await load());
    expect(button(tree, "비활성화")?.disabled).toBe(false); expect(button(tree, "품목 삭제")?.disabled).toBe(false);
    expect(find(tree, (type, props) => type === "details" && text(props.children).includes("품목 삭제"))).toBeNull();
  });

  it.each([true, false])("allows explicit zero-stock product management for hasHistory=%s", async (hasHistory) => {
    const tree = more(await load({ product: { ...product, hasHistory, quantityByLocation: inventoryLocationMap(0) }, lots: [] }, { ...context, canAdmin: true }), { ...context, canAdmin: true }, { countMode: true });
    expect(button(tree, "비활성화")?.disabled).toBe(false); expect(button(tree, "품목 삭제")?.disabled).toBe(false);
    expect(button(tree, "출고")?.disabled).toBe(true); expect(button(tree, "조정")?.disabled).toBe(true);
    expect(button(tree, "수량 일치 확인")?.disabled).toBe(false);
    expect(text(tree)).not.toContain("이 장소에 보관 중인 재고가 없어요");
    expect(text(tree)).not.toContain("유통기한별 수량");
  });

  it("keeps editing and stock actions active-only while allowing employees to reactivate an inactive product", async () => {
    const tree = more(await load({ ...detail, product: { ...product, status: "inactive" } }));
    expect(button(tree, "다시 활성화")?.disabled).toBe(false); expect(button(tree, "품목 삭제")?.disabled).toBe(false);
    expect(button(tree, "품목 정보 수정")).toBeNull(); expect(button(tree, "입고")).toBeNull();
    expect(button(tree, "입출고·실사 이력")).not.toBeNull();
  });

  it("places four frequent actions first and count/more second in one pinned footer", async () => {
    const footer = (tree: ReactNode) => find(tree, (type) => typeof type === "function" && type.name === "BottomSheetActions");
    const tree = await load();
    for (const label of ["품목 정보 수정", "더보기", "출고", "입고", "조정", "수량 일치 확인"]) expect(button(footer(tree)?.children, label)).not.toBeNull();
    const rows = footer(tree)?.children as ReactNode[];
    for (const label of ["출고", "입고", "조정", "품목 정보 수정"]) expect(button(rows[0], label)).not.toBeNull();
    for (const label of ["수량 일치 확인", "더보기"]) expect(button(rows[1], label)).not.toBeNull();
    const readOnly = render({ ...context, canWrite: false });
    expect(button(footer(readOnly)?.children, "더보기")).not.toBeNull();
    expect(button(footer(readOnly)?.children, "품목 정보 수정")).toBeNull();
  });

  it("uses a static label for one storage location and only real targets in the compact multi-location picker", async () => {
    const single = await load();
    expect(find(single, (type) => type === "select")).toBeNull();
    expect(find(single, (_, props) => props.role === "group" && props["aria-label"] === "상세 보관 장소")).toBeNull();
    const multi = { product: { ...product, quantityByLocation: { ...product.quantityByLocation, sample: 4 } }, lots: [...detail.lots, { ...detail.lots[0]!, lotId: "sample-lot", locationId: "sample" as const, quantity: 4 }] };
    harness.detail.mockResolvedValueOnce(multi); detailEffect().run(); await settle();
    const picker = find(render(), (type, props) => type === "select" && props["aria-label"] === "상세 보관 장소")!;
    const options = picker.children as Array<{ props: { value: string } }>;
    expect(options.map((option) => option.props.value)).toEqual(["refrigerated", "sample"]);
    (picker.onChange as (event: { target: { value: string } }) => void)({ target: { value: "sample" } });
    expect(text(render())).toContain("4봉");
  });

  it("shows a D badge only inside the urgent window and enables enlargement for a saved product photo", async () => {
    const tree = await load({ product: { ...product, photo: { photoId: "bb1ee35c-2e39-4c96-89ce-9b720f58e65f", width: 1280, height: 960 } }, lots: [{ ...detail.lots[0]!, expiryDate: "2027-12-01" }] });
    expect(text(tree)).toContain("2027.12.01"); expect(text(tree)).not.toContain("D-");
    expect(find(tree, (type) => typeof type === "function" && type.name === "InventoryPhoto")?.expandable).toBe(true);
  });

  it("keeps the action row in place but disables all mutation controls when offline", async () => {
    await load(detail, { ...context, canAdmin: true }); harness.online = false;
    const tree = more(render({ ...context, canAdmin: true }), { ...context, canAdmin: true });
    for (const label of ["출고", "입고", "조정", "수량 일치 확인", "품목 정보 수정", "비활성화", "품목 삭제"]) expect(button(tree, label)?.disabled).toBe(true);
  });

  it("applies only a confirmed product+lot snapshot and skips an unnecessary detail fetch", async () => {
    let tree = await load(); (button(tree, "출고")!.onClick as () => void)(); tree = render();
    const movement = find(tree, (type) => typeof type === "function" && type.name === "InventoryMovementForm")!;
    const changed: InventoryProductDetail = { product: { ...product, stockRevision: 2, quantityByLocation: { ...product.quantityByLocation, refrigerated: 25 } }, lots: [{ ...detail.lots[0]!, quantity: 25, revision: 2 }] };
    (movement.onSaved as (product: typeof changed.product, detail: InventoryProductDetail) => void)(changed.product, changed);
    tree = render(); expect(detailEffect().deps).toEqual([product.productId, 0]);
    expect(harness.detail).toHaveBeenCalledOnce(); expect(text(tree)).toContain("25봉");
    expect(button(tree, "출고")?.disabled).toBe(false); expect(harness.saved).toHaveBeenCalledWith(changed.product);
  });

  it("retains the recheck path for legacy responses and keeps actions disabled until it finishes", async () => {
    let tree = await load(); (button(tree, "입고")!.onClick as () => void)(); tree = render();
    const movement = find(tree, (type) => typeof type === "function" && type.name === "InventoryMovementForm")!;
    (movement.onSaved as (nextProduct: typeof product) => void)(product);
    tree = render(); expect(detailEffect().deps).toEqual([product.productId, 1]);
    for (const label of ["출고", "입고", "조정", "수량 일치 확인"]) expect(button(tree, label)?.disabled).toBe(true);
  });
  it("defaults counting off with a visible reason and requires both mode and the trusted calendar", async () => {
    let tree = await load();
    expect(button(tree, "수량 일치 확인")?.disabled).toBe(true); expect(text(tree)).toContain("실사 모드에서 사용");
    (button(tree, "수량 일치 확인")!.onClick as () => void)();
    expect(find(render(), (type) => typeof type === "function" && type.name === "InventoryCountForm")).toBeNull();
    tree = render(context, { countMode: true, calendarReady: false });
    expect(button(tree, "수량 일치 확인")?.disabled).toBe(true); expect(text(tree)).toContain("날짜 기준 확인 필요");
    tree = render(context, { countMode: true }); (button(tree, "수량 일치 확인")!.onClick as () => void)();
    expect(find(render(context, { countMode: true }), (type) => typeof type === "function" && type.name === "InventoryCountForm")?.countMode).toBe(true);
  });
  it("hides pending outside count day/mode and never marks a product created after the scheduled count as pending", async () => {
    const badge = (tree: ReactNode) => find(tree, (type) => typeof type === "function" && type.name === "StatusBadge");
    expect(badge(await load())).toBeNull();
    expect(text(badge(render(context, { countMode: true }))?.children)).toBe("미확인");
    const newer = { ...detail, product: { ...product, createdAt: "2026-09-12T00:00:00.000Z" } };
    harness.detail.mockResolvedValueOnce(newer); detailEffect().run(); await settle();
    expect(badge(render(context, { countMode: true }))).toBeNull();
  });
  it("opens risk confirmation and history only from the more sheet, without mutating immediately", async () => {
    let tree = more(await load());
    expect(find(tree, (type, props) => typeof type === "function" && type.name === "BottomSheet" && props.title === "품목 더보기")).not.toBeNull();
    (button(tree, "품목 삭제")!.onClick as () => void)(); tree = render();
    expect(find(tree, (type) => typeof type === "function" && type.name === "InventoryStatusForm")?.remove).toBe(true);
    expect(find(tree, (type, props) => typeof type === "function" && type.name === "BottomSheet" && props.title === "품목 더보기")).toBeNull();
    expect(harness.saved).not.toHaveBeenCalled();
    tree = more(tree); (button(tree, "입출고·실사 이력")!.onClick as () => void)(); tree = render();
    const history = find(tree, (type, props) => typeof type === "function" && type.name === "BottomSheet" && props.title === "입출고·실사 기록");
    expect(history).not.toBeNull(); (history!.onClose as () => void)();
    expect(find(render(), (type, props) => typeof type === "function" && type.name === "BottomSheet" && props.title === "입출고·실사 기록")).toBeNull();
    expect(harness.close).not.toHaveBeenCalled();
  });
  it.each(["receive", "issue", "adjust"] as const)("keeps the selected expiry lot when opening %s and clears it for a general action", async (kind) => {
    let tree = await load(); (button(tree, "2026.12.01 유통기한 수정")!.onClick as () => void)(); tree = render();
    const editor = find(tree, (type) => typeof type === "function" && type.name === "InventoryLotEditor")!;
    (editor.onMovement as (kind: string, id: string) => void)(kind, "lot-1"); tree = render();
    const form = find(tree, (type) => typeof type === "function" && type.name === "InventoryMovementForm")!;
    expect(form.kind).toBe(kind); expect(form.initialLotId).toBe("lot-1");
    expect(find(tree, (type) => typeof type === "function" && type.name === "InventoryLotEditor")).toBeNull();
    (form.onClose as () => void)(); tree = render(); (button(tree, "입고")!.onClick as () => void)();
    expect(find(render(), (type) => typeof type === "function" && type.name === "InventoryMovementForm")?.initialLotId).toBeUndefined();
  });
  it("rejects movement requests for an unknown or different-location lot", async () => {
    let tree = await load(); (button(tree, "2026.12.01 유통기한 수정")!.onClick as () => void)(); tree = render();
    const editor = find(tree, (type) => typeof type === "function" && type.name === "InventoryLotEditor")!;
    (editor.onMovement as (kind: string, id: string) => void)("issue", "other-location-lot");
    expect(find(render(), (type) => typeof type === "function" && type.name === "InventoryMovementForm")).toBeNull();
  });
  it.each([[false, true], [true, false], [true, true]])("passes a manual inspection cycle only when countMode=%s and calendarReady=%s", async (countMode, calendarReady) => {
    const options = { countMode, calendarReady }; const tree = await load(detail, context, options);
    (button(tree, "입고")!.onClick as () => void)();
    const form = find(render(context, options), (type) => typeof type === "function" && type.name === "InventoryMovementForm")!;
    expect(form.inspectionCycleId).toBe(countMode && calendarReady ? context.cycle.cycleId : undefined);
  });
});
