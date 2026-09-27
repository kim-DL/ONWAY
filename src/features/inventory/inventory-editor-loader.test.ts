import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./inventory-product-editor", () => ({ InventoryProductEditorImpl: () => null }));
const idle = vi.fn();
const cancel = vi.fn();
beforeEach(() => {
  vi.resetModules(); idle.mockReset().mockReturnValue(7); cancel.mockReset();
  vi.stubGlobal("navigator", { connection: { saveData: false } });
  vi.stubGlobal("window", { requestIdleCallback: idle, cancelIdleCallback: cancel });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("inventory editor code preparation", () => {
  it("skips speculative code in Save-Data mode", async () => {
    vi.stubGlobal("navigator", { connection: { saveData: true } });
    const { scheduleInventoryProductEditorPreload } = await import("./inventory-editor-loader");
    scheduleInventoryProductEditorPreload()();
    expect(idle).not.toHaveBeenCalled();
  });
  it("cancels pending idle work when leaving the workspace", async () => {
    const { scheduleInventoryProductEditorPreload } = await import("./inventory-editor-loader");
    scheduleInventoryProductEditorPreload()();
    expect(cancel).toHaveBeenCalledWith(7);
  });
  it("shares one module preparation promise with the actual editor", async () => {
    const { scheduleInventoryProductEditorPreload, loadInventoryProductEditor, getLoadedInventoryProductEditor } = await import("./inventory-editor-loader");
    expect(getLoadedInventoryProductEditor()).toBeUndefined();
    scheduleInventoryProductEditorPreload();
    idle.mock.calls[0]![0]();
    const first = loadInventoryProductEditor();
    expect(loadInventoryProductEditor()).toBe(first);
    const loaded = await first;
    expect(loaded.default).toBeTypeOf("function");
    expect(getLoadedInventoryProductEditor()).toBe(loaded.default);
    expect(loadInventoryProductEditor()).toBe(first);
  });
  it("can cancel the delayed fallback on browsers without idle callbacks", async () => {
    const schedule = vi.fn().mockReturnValue(9), clear = vi.fn();
    vi.stubGlobal("window", { setTimeout: schedule, clearTimeout: clear });
    const { scheduleInventoryProductEditorPreload } = await import("./inventory-editor-loader");
    scheduleInventoryProductEditorPreload()();
    expect(schedule.mock.calls[0]![1]).toBe(500); expect(clear).toHaveBeenCalledWith(9);
  });
});
