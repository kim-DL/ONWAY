import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, saveInventoryProductInputSchema, type InventoryLotDraft, type InventoryProduct } from "@/domain/inventory";

const harness = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as Array<{ current: unknown }>, stateCursor: 0, refCursor: 0, online: true, save: vi.fn(), upload: vi.fn(), saved: vi.fn(), movement: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = harness.stateCursor++; if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial; return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }]; },
  useRef: (initial: unknown) => { const index = harness.refCursor++; return harness.refs[index] ?? (harness.refs[index] = { current: initial }); },
  useId: () => "inventory-registration-test", useEffect: () => undefined,
}));
vi.mock("client-only", () => ({}));
vi.mock("./use-inventory-connection", () => ({ useInventoryConnection: () => harness.online, INVENTORY_OFFLINE_DRAFT_MESSAGE: "연결 후 다시 저장해주세요." }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { save: harness.save, uploadPhoto: harness.upload, movement: harness.movement }, inventoryErrorMessage: () => "다시 확인해주세요." }));
import { InventoryProductEditor } from "./inventory-forms";

const product = inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "검증용 만두", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 12, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 3, stockRevision: 1, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 29 }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1" });
type Props = Record<string, unknown> & { children?: ReactNode };
function find(node: ReactNode, predicate: (type: unknown, props: Props) => boolean): ReactElement<Props> | null {
  if (Array.isArray(node)) { for (const item of node) { const found = find(item, predicate); if (found) return found; } return null; }
  if (!isValidElement<Props>(node)) return null;
  return predicate(node.type, node.props) ? node : find(node.props.children, predicate);
}
const named = (tree: ReactNode, name: string) => find(tree, (type) => typeof type === "function" && type.name === name)!;
const noop = () => undefined;
function render(edit: InventoryProduct | null = null) { harness.stateCursor = 0; harness.refCursor = 0; return InventoryProductEditor({ product: edit, location: "refrigerated", onClose: noop, onSaved: harness.saved }); }
function changeField(tree: ReactNode, label: string, value: string, type = "input") {
  const field = find(tree, (nodeType, props) => nodeType === "label" && (Array.isArray(props.children) ? props.children : [props.children]).some((child) => typeof child === "string" && child.trim().startsWith(label)))!;
  const input = find(field.props.children, (nodeType) => nodeType === type)!;
  (input.props.onChange as (event: { target: { value: string; valueAsNumber: number } }) => void)({ target: { value, valueAsNumber: Number(value) } });
}
function quantity(tree: ReactNode, value: number) { (named(tree, "QuantityFields").props.onChange as (value: number) => void)(value); }
function expiry(tree: ReactNode, expiryState: InventoryLotDraft["expiryState"], expiryDate: string | null) { (named(tree, "LotFields").props.onChange as (lot: InventoryLotDraft) => void)({ label: "", expiryState, expiryDate }); }
function submit(tree: ReactNode) { return (find(tree, (type) => type === "form")!.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: noop }); }
function filled() {
  let tree = render(); changeField(tree, "품목명", product.name); changeField(tree, "기준 단위", "봉");
  tree = render(); quantity(tree, 29); expiry(tree, "dated", "2026-12-01"); return render();
}
async function settle() { for (let index = 0; index < 6; index += 1) await Promise.resolve(); }
beforeEach(() => { harness.states = []; harness.refs = []; harness.stateCursor = 0; harness.refCursor = 0; harness.online = true; harness.save.mockReset().mockResolvedValue(product); harness.upload.mockReset().mockResolvedValue({}); harness.saved.mockReset(); harness.movement.mockReset(); vi.stubGlobal("navigator", { onLine: true }); });
afterEach(() => vi.unstubAllGlobals());

describe("single-submit inventory registration", () => {
  it("commits product and positive initial stock to the chosen location in one call", async () => {
    let tree = filled(); changeField(tree, "기본 보관 장소", "freezer1", "select"); tree = render(); await submit(tree);
    expect(harness.save).toHaveBeenCalledOnce();
    const input = harness.save.mock.calls[0]![0];
    expect(saveInventoryProductInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({ productId: null, expectedRevision: null, draft: { name: product.name, defaultLocationId: "freezer1", unitsPerBox: 1 }, initialStock: { quantity: 29, lot: { label: "", expiryState: "dated", expiryDate: "2026-12-01" } } });
    expect(harness.movement).not.toHaveBeenCalled(); expect(harness.saved).toHaveBeenCalledWith(product);
  });

  it("changes a new product unit label without multiplying its entered quantity", async () => {
    let tree = filled(); changeField(tree, "기준 단위", "팩"); tree = render();
    expect(named(tree, "QuantityFields").props).toMatchObject({ value: 29, product: { unitLabel: "팩", unitsPerBox: 1 } });
    await submit(tree); expect(harness.save.mock.calls[0]![0].initialStock.quantity).toBe(29);
  });

  it("uses exactly one base-unit field and associates fractional errors with that input", () => {
    const quantityField = named(filled(), "QuantityFields");
    const Component = quantityField.type as (props: Props) => ReactElement<Props>;
    harness.states = []; harness.stateCursor = 0; harness.refCursor = 0;
    const tree = Component({ ...quantityField.props, value: 1.5 });
    const input = find(tree, (type) => type === "input")!;
    expect(input.props["aria-invalid"]).toBe(true);
    expect(input.props["aria-describedby"]).toBe("inventory-registration-test-quantity-error");
    expect(input.props["aria-label"]).toBe("초기 수량 (필수) (봉)");
  });

  it.each([0, 1.5, -1, Number.NaN, 1_000_000_001])("rejects invalid base-unit initial quantity %s before uploading or saving", async (value) => {
    let tree = filled(); quantity(tree, value); tree = render(); await submit(tree);
    expect(harness.save).not.toHaveBeenCalled(); expect(harness.upload).not.toHaveBeenCalled();
    expect(find(render(), (_type, props) => props.role === "alert")).not.toBeNull();
  });

  it("requires a valid dated expiry or explicit unknown and rejects new not-applicable stock", async () => {
    let tree = filled(); expiry(tree, "dated", ""); await submit(render()); expect(harness.save).not.toHaveBeenCalled();
    tree = render(); expiry(tree, "unknown", null); await submit(render()); expect(harness.save.mock.calls[0]![0].initialStock.lot).toMatchObject({ expiryState: "unknown", expiryDate: null });
    tree = render(); expiry(tree, "not_applicable", null); await submit(render()); expect(harness.save).toHaveBeenCalledOnce();
  });

  it("never exposes or sends initial stock while editing existing product information", async () => {
    const tree = render(product);
    expect(find(tree, (type) => typeof type === "function" && type.name === "QuantityFields")).toBeNull();
    expect(find(tree, (type) => typeof type === "function" && type.name === "LotFields")).toBeNull();
    await submit(tree);
    expect(harness.save.mock.calls[0]![0]).toMatchObject({ productId: product.productId, expectedRevision: 3 });
    expect(harness.save.mock.calls[0]![0].draft.unitsPerBox).toBe(12);
    expect(harness.save.mock.calls[0]![0]).not.toHaveProperty("initialStock");
  });

  it("preserves the draft offline and saves only on an explicit online retry", async () => {
    const tree = filled(); harness.online = false; Object.assign(navigator, { onLine: false }); await submit(tree);
    expect(harness.save).not.toHaveBeenCalled();
    expect(named(render(), "QuantityFields").props.value).toBe(29);
    harness.online = true; Object.assign(navigator, { onLine: true }); expect(harness.save).not.toHaveBeenCalled(); await submit(render());
    expect(harness.save).toHaveBeenCalledOnce();
  });

  it("deduplicates taps and reuses the same request and prepared photo after an uncertain save", async () => {
    const file = new File(["photo"], "product.webp", { type: "image/webp" });
    let tree = filled(); (named(tree, "InventoryPhotoPicker").props.onChange as (file: File, removed: boolean) => void)(file, false); tree = render();
    let reject!: (error: unknown) => void;
    harness.save.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValueOnce(product);
    const first = submit(tree); void submit(tree); await settle();
    expect(harness.upload).toHaveBeenCalledOnce(); expect(harness.save).toHaveBeenCalledOnce();
    reject(new Error("timeout")); await first; await submit(render());
    expect(harness.upload).toHaveBeenCalledOnce(); expect(harness.save).toHaveBeenCalledTimes(2);
    expect(harness.save.mock.calls[0]![0]).toEqual(harness.save.mock.calls[1]![0]);
  });
});
