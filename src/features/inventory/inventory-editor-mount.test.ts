import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ initialized: false, state: undefined as unknown, loaded: undefined as (() => null) | undefined }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    if (!h.initialized) { h.state = typeof initial === "function" ? initial() : initial; h.initialized = true; }
    return [h.state, vi.fn()];
  },
}));
vi.mock("client-only", () => ({}));
vi.mock("./inventory-editor-loader", () => ({ getLoadedInventoryProductEditor: () => h.loaded, loadInventoryProductEditor: vi.fn() }));
import { InventoryProductEditor } from "./inventory-forms";

const ReadyEditor = () => null;
function render() {
  const tree = InventoryProductEditor({ product: null, location: "refrigerated", onClose: vi.fn(), onSaved: vi.fn() });
  expect(isValidElement(tree.props.children)).toBe(true);
  return tree.props.children.type;
}
beforeEach(() => { h.initialized = false; h.state = undefined; h.loaded = undefined; });
describe("inventory editor component identity", () => {
  it("uses the already prepared component on the first render and latches it", () => {
    h.loaded = ReadyEditor; expect(render()).toBe(ReadyEditor);
    h.loaded = () => null; expect(render()).toBe(ReadyEditor);
  });
  it("keeps the cold lazy component after module resolution so the draft is not remounted", () => {
    const cold = render(); expect(cold).not.toBe(ReadyEditor);
    h.loaded = ReadyEditor;
    expect(render()).toBe(cold);
    // Closing and reopening creates a new wrapper lifetime, which can now use
    // the resolved component immediately without replacing an existing draft.
    h.initialized = false; h.state = undefined;
    expect(render()).toBe(ReadyEditor);
  });
});
