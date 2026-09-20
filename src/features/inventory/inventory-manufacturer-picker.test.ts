import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearInventoryWorkspaceSnapshot, getInventoryWorkspaceSession } from "./inventory-workspace-snapshot";
import { readRecentInventoryManufacturers } from "./inventory-manufacturer-session";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as Array<{ current: unknown }>, stateCursor: 0, refCursor: 0,
  effects: [] as Array<() => void | (() => void)>, list: vi.fn(), reference: vi.fn(), create: vi.fn(), saveProduct: vi.fn(), selected: vi.fn(), cleared: vi.fn(), closed: vi.fn(),
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = harness.stateCursor++; if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial; return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? (next as (old: unknown) => unknown)(harness.states[index]) : next; }]; },
  useRef: (initial: unknown) => { const index = harness.refCursor++; return harness.refs[index] ?? (harness.refs[index] = { current: initial }); },
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); }, useMemo: (factory: () => unknown) => factory(), useId: () => "manufacturer-picker-test",
}));
vi.mock("client-only", () => ({}));
vi.mock("./inventory-manufacturer-repository", () => ({ inventoryManufacturerRepository: { list: harness.list, reference: harness.reference, create: harness.create, saveProduct: harness.saveProduct } }));
import { InventoryManufacturerPicker, filterInventoryManufacturers, inventoryManufacturerCandidates } from "./inventory-manufacturer-picker";

const manufacturers = [
  { manufacturerId: "m-one", name: "사옹원", normalizedName: "사옹원", active: true, revision: 1, createdAt: "2026-09-21T00:00:00.000Z", createdBy: "EMP", updatedAt: "2026-09-21T00:00:00.000Z" },
  { manufacturerId: "m-two", name: "CJ 제일제당", normalizedName: "cj제일제당", active: true, revision: 1, createdAt: "2026-09-21T00:00:00.000Z", createdBy: "EMP", updatedAt: "2026-09-21T00:00:00.000Z" },
  { manufacturerId: "m-old", name: "비활성 제조사", normalizedName: "비활성제조사", active: false, revision: 2, createdAt: "2026-09-21T00:00:00.000Z", createdBy: "EMP", updatedAt: "2026-09-21T00:00:00.000Z" },
];
type Props = Record<string, unknown> & { children?: ReactNode };
function findAll(node: ReactNode, predicate: (type: unknown, props: Props) => boolean, found: Array<ReactElement<Props>> = []) {
  if (Array.isArray(node)) { for (const item of node) findAll(item, predicate, found); return found; }
  if (!isValidElement<Props>(node)) return found;
  if (predicate(node.type, node.props)) found.push(node);
  findAll(node.props.children, predicate, found); return found;
}
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}
const props = (overrides: Partial<Parameters<typeof InventoryManufacturerPicker>[0]> = {}) => ({
  current: { name: "" }, sessionNamespace: "session-a", allowCreate: true,
  onSelect: harness.selected, onClear: harness.cleared, onClose: harness.closed, ...overrides,
});
function render(overrides: Partial<Parameters<typeof InventoryManufacturerPicker>[0]> = {}) {
  harness.stateCursor = 0; harness.refCursor = 0; harness.effects = [];
  return InventoryManufacturerPicker(props(overrides));
}
async function load(overrides: Partial<Parameters<typeof InventoryManufacturerPicker>[0]> = {}) {
  render(overrides); const effect = harness.effects[0]!; effect();
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  return render(overrides);
}
beforeEach(() => {
  harness.states = []; harness.refs = []; harness.effects = [];
  harness.list.mockReset().mockResolvedValue(manufacturers); harness.create.mockReset();
  harness.reference.mockReset();
  harness.saveProduct.mockReset();
  harness.selected.mockReset(); harness.cleared.mockReset(); harness.closed.mockReset();
  getInventoryWorkspaceSession("session-a");
  vi.stubGlobal("crypto", { randomUUID: () => "41bd2065-a415-4e30-8b97-3dca1f8a66cc" });
});
afterEach(() => { clearInventoryWorkspaceSnapshot(); vi.unstubAllGlobals(); });

describe("inventory manufacturer picker", () => {
  it("filters the loaded active list locally without another network request or opening the keyboard", async () => {
    let tree = await load();
    expect(textOf(tree)).toContain("새 제조사 추가");
    expect(harness.list).toHaveBeenCalledOnce();
    expect(findAll(tree, (_type, item) => item.role === "option").map((item) => textOf(item))).toEqual(["제조사 없음", "사옹원", "CJ 제일제당"]);
    const search = findAll(tree, (type, item) => type === "input" && item.role === "combobox")[0]!;
    expect(search.props.autoFocus).toBeUndefined();
    (search.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "cj" } });
    tree = render();
    expect(findAll(tree, (_type, item) => item.role === "option").map((item) => textOf(item))).toEqual(["제조사 없음", "CJ 제일제당"]);
    expect(harness.list).toHaveBeenCalledOnce();
  });

  it("selects an existing manufacturer, remembers it, and offers explicit none", async () => {
    const tree = await load();
    const options = findAll(tree, (_type, item) => item.role === "option");
    (options.find((item) => textOf(item) === "사옹원")!.props.onClick as () => void)();
    expect(harness.selected).toHaveBeenCalledWith(manufacturers[0], harness.saveProduct);
    expect(readRecentInventoryManufacturers("session-a")).toEqual([{ manufacturerId: "m-one", name: "사옹원" }]);
    (options[0]!.props.onClick as () => void)(); expect(harness.cleared).toHaveBeenCalledOnce();
  });

  it("adds a new manufacturer and selects it immediately while preserving duplicate input", async () => {
    let tree = await load();
    const add = findAll(tree, (_type, item) => typeof item.onClick === "function" && textOf(item.children).includes("새 제조사 추가"))[0]!;
    (add.props.onClick as () => void)(); tree = render();
    const input = findAll(tree, (type, item) => type === "input" && item.maxLength === 200)[0]!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "동원" } }); tree = render();
    const created = { ...manufacturers[0]!, manufacturerId: "m-new", name: "동원", normalizedName: "동원" };
    harness.create.mockResolvedValueOnce(created);
    (findAll(tree, (_type, item) => typeof item.onClick === "function" && textOf(item.children) === "추가 후 선택")[0]!.props.onClick as () => void)();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    expect(harness.create).toHaveBeenCalledWith({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", name: "동원" });
    expect(harness.selected).toHaveBeenCalledWith(created, harness.saveProduct);

    harness.states = []; harness.refs = []; tree = await load();
    (findAll(tree, (_type, item) => typeof item.onClick === "function" && textOf(item.children).includes("새 제조사 추가"))[0]!.props.onClick as () => void)(); tree = render();
    const duplicateInput = findAll(tree, (type, item) => type === "input" && item.maxLength === 200)[0]!;
    (duplicateInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: " 사옹원 " } }); tree = render();
    harness.create.mockRejectedValueOnce({ code: "functions/already-exists", details: { reason: "inventory-manufacturer-duplicate" } });
    (findAll(tree, (_type, item) => typeof item.onClick === "function" && textOf(item.children) === "추가 후 선택")[0]!.props.onClick as () => void)();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    tree = render();
    expect(findAll(tree, (type, item) => type === "input" && item.maxLength === 200)[0]!.props.value).toBe(" 사옹원 ");
    expect(textOf(findAll(tree, (_type, item) => item.role === "alert")[0])).toContain("기존 제조사를 선택");
  });

  it("preserves an inactive current reference but excludes it from selectable active options and hides create for viewers", async () => {
    harness.reference.mockResolvedValueOnce({ product: { manufacturer: "비활성 제조사 snapshot", manufacturerId: "m-old" }, lots: [] });
    const tree = await load({ productId: "product-1", current: { name: "비활성 제조사 snapshot" }, allowCreate: false });
    expect(harness.reference).toHaveBeenCalledWith("product-1");
    expect(textOf(tree)).toContain("비활성 또는 현재 선택 목록에 없는 연결");
    expect(findAll(tree, (_type, item) => item.role === "option").map((item) => textOf(item))).not.toContain("비활성 제조사");
    expect(textOf(tree)).not.toContain("새 제조사 추가");
  });

  it("uses normalized name and name matches without fuzzy merging", () => {
    expect(filterInventoryManufacturers(manufacturers, "CJ-제일").map((item) => item.manufacturerId)).toEqual(["m-two"]);
    expect(inventoryManufacturerCandidates(manufacturers, "사옹원 식품").map((item) => item.manufacturerId)).toEqual(["m-one"]);
  });
});
