import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as Array<{ current: unknown }>, cursor: 0, refCursor: 0,
  effects: [] as Array<() => void | (() => void)>, frame: vi.fn(), cancelFrame: vi.fn(), timer: vi.fn(), clearTimer: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = h.cursor++; if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [h.states[index], (value: unknown) => { h.states[index] = typeof value === "function" ? value(h.states[index]) : value; }]; },
  useRef: (initial: unknown) => { const index = h.refCursor++; return h.refs[index] ??= { current: initial }; },
  useId: () => "ready-editor",
  useEffect: (effect: () => void | (() => void)) => { h.effects.push(effect); },
}));
vi.mock("client-only", () => ({}));
vi.mock("./use-inventory-connection", () => ({ useInventoryConnection: () => true, INVENTORY_OFFLINE_DRAFT_MESSAGE: "offline" }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: {}, inventoryErrorMessage: () => "error" }));
import { useInventoryEditorReady } from "./use-inventory-editor-ready";
import { InventoryProductEditorImpl } from "./inventory-product-editor";

type Props = { children?: ReactNode; role?: string; value?: string; maxLength?: number; onChange?: (event: { target: { value: string } }) => void };
function find(tree: ReactNode, match: (type: unknown, props: Props) => boolean): Props | null {
  if (Array.isArray(tree)) { for (const child of tree) { const found = find(child, match); if (found) return found; } return null; }
  if (!isValidElement<Props>(tree)) return null;
  return match(tree.type, tree.props) ? tree.props : find(tree.props.children, match);
}
function ReadyProbe() { return useInventoryEditorReady(); }
function renderHook() { h.cursor = 0; h.refCursor = 0; h.effects = []; return ReadyProbe(); }
function renderEditor() {
  h.cursor = 0; h.refCursor = 0; h.effects = [];
  return InventoryProductEditorImpl({ product: null, location: "refrigerated", onClose: vi.fn(), onSaved: vi.fn() });
}
beforeEach(() => {
  h.states = []; h.refs = []; h.cursor = 0; h.refCursor = 0; h.effects = [];
  h.frame.mockReset().mockReturnValue(11); h.cancelFrame.mockReset(); h.timer.mockReset().mockReturnValue(12); h.clearTimer.mockReset();
  vi.stubGlobal("window", { requestAnimationFrame: h.frame, cancelAnimationFrame: h.cancelFrame, setTimeout: h.timer, clearTimeout: h.clearTimer });
});
afterEach(() => vi.unstubAllGlobals());

describe("inventory editor first paint", () => {
  it("waits for a frame and a following zero-delay task, then stays ready", () => {
    expect(renderHook()).toBe(false); const cleanup = h.effects[0]!() as () => void;
    expect(h.timer).not.toHaveBeenCalled(); h.frame.mock.calls[0]![0]();
    expect(renderHook()).toBe(false); expect(h.timer.mock.calls[0]![1]).toBe(0);
    h.timer.mock.calls[0]![0](); expect(renderHook()).toBe(true); expect(renderHook()).toBe(true);
    cleanup();
  });
  it("cancels a queued frame on close and ignores even a late frame callback", () => {
    renderHook(); const cleanup = h.effects[0]!() as () => void;
    cleanup(); expect(h.cancelFrame).toHaveBeenCalledWith(11);
    h.frame.mock.calls[0]![0](); expect(h.timer).not.toHaveBeenCalled(); expect(renderHook()).toBe(false);
  });
  it("cancels the task after its frame and ignores a late task after unmount", () => {
    renderHook(); const cleanup = h.effects[0]!() as () => void;
    h.frame.mock.calls[0]![0](); cleanup(); expect(h.clearTimer).toHaveBeenCalledWith(12);
    h.timer.mock.calls[0]![0](); expect(renderHook()).toBe(false);
  });
  it("mounts no form or save footer before readiness and retains the entered draft afterward", () => {
    const shell = renderEditor();
    expect(shell.props.title).toBe("새 품목 등록"); expect(shell.props.dismissible).toBe(true);
    expect(find(shell, (_type, props) => props.role === "status")).not.toBeNull();
    expect(find(shell, (type) => type === "form" || type === "input" || typeof type === "function" && type.name === "FormFooter")).toBeNull();
    const cleanup = h.effects[0]!() as () => void;
    h.frame.mock.calls[0]![0](); h.timer.mock.calls[0]![0]();
    const form = renderEditor();
    expect(find(form, (type) => type === "form")).not.toBeNull();
    expect(find(form, (type) => typeof type === "function" && type.name === "FormFooter")).not.toBeNull();
    const name = find(form, (type, props) => type === "input" && props.maxLength === 200)!;
    name.onChange!({ target: { value: "현장 입력 유지" } });
    expect(find(renderEditor(), (type, props) => type === "input" && props.maxLength === 200)?.value).toBe("현장 입력 유지");
    cleanup();
  });
});
