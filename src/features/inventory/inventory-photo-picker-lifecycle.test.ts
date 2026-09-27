import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as Array<{ current: unknown }>, cursor: 0, refCursor: 0,
  effects: [] as Array<() => void | (() => void)>, read: vi.fn(), prepare: vi.fn(), validate: vi.fn(),
  create: vi.fn(), forget: vi.fn(), register: vi.fn(), change: vi.fn(), busy: vi.fn(), upload: vi.fn(),
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = h.cursor++; if (!(i in h.states)) h.states[i] = initial; return [h.states[i], (next: unknown) => { h.states[i] = typeof next === "function" ? next(h.states[i]) : next; }]; },
  useRef: (initial: unknown) => { const i = h.refCursor++; return h.refs[i] ??= { current: initial }; },
  useEffect: (effect: () => void | (() => void)) => { h.effects.push(effect); },
}));
vi.mock("@/features/customers/customer-photo-preparation", () => ({ CUSTOMER_PHOTO_SOURCE_MAX_BYTES: 30 * 1024 * 1024, readCustomerPhotoSource: h.read, prepareCustomerPhoto: h.prepare, validateCustomerPhotoFile: h.validate }));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/features/auth/private-client-state", () => ({ registerPrivateBlobUrl: h.register, forgetPrivateBlobUrl: h.forget }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { uploadPhoto: h.upload }, inventoryErrorMessage: () => "사진 오류" }));
import { InventoryPhotoPicker } from "./inventory-photo";

type ElementProps = { children?: ReactNode; type?: string; src?: string; role?: string; onChange?: (event: unknown) => Promise<void>; onClick?: () => void };
function find(tree: ReactNode, predicate: (props: ElementProps) => boolean): ElementProps | null {
  if (Array.isArray(tree)) { for (const child of tree) { const result = find(child, predicate); if (result) return result; } return null; }
  if (!isValidElement<ElementProps>(tree)) return null;
  return predicate(tree.props) ? tree.props : find(tree.props.children, predicate);
}
function render(file: File | null = null) {
  h.cursor = 0; h.refCursor = 0; h.effects = [];
  return InventoryPhotoPicker({ product: null, file, removed: false, disabled: false, onChange: h.change, onBusyChange: h.busy });
}
function select(tree: ReactNode, file: File) {
  const input = { files: [file], value: "native-camera-file" };
  return { input, pending: find(tree, (props) => props.type === "file")!.onChange!({ currentTarget: input }) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const source = new File(["source"], "camera.jpg", { type: "image/jpeg" });
const prepared = new File(["prepared"], "camera.webp", { type: "image/webp" });
let cleanup: (() => void) | undefined;
beforeEach(() => {
  h.states = []; h.refs = []; h.effects = [];
  for (const mock of [h.read, h.prepare, h.validate, h.create, h.forget, h.register, h.change, h.busy, h.upload]) mock.mockReset();
  h.validate.mockReturnValue(null); h.read.mockResolvedValue(source); h.prepare.mockResolvedValue(prepared);
  h.create.mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  vi.stubGlobal("URL", { createObjectURL: h.create });
  render(); cleanup = h.effects[0]!() || undefined;
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

describe("inventory capture lifecycle", () => {
  it("replaces a prepared capture on retake and revokes the old preview without uploading", async () => {
    await select(render(), source).pending;
    expect(find(render(prepared), (props) => !!props.src)?.src).toBe("blob:first");
    const second = new File(["second"], "second.webp", { type: "image/webp" }); h.prepare.mockResolvedValueOnce(second);
    await select(render(prepared), source).pending;
    expect(h.change.mock.calls).toEqual([[prepared, false], [second, false]]);
    expect(find(render(second), (props) => !!props.src)?.src).toBe("blob:second");
    expect(h.forget).toHaveBeenCalledWith("blob:first"); expect(h.upload).not.toHaveBeenCalled();
  });
  it.each(["materialization", "optimization"])("discards late results after leaving during %s", async (phase) => {
    const waiting = deferred<File>();
    (phase === "materialization" ? h.read : h.prepare).mockReturnValueOnce(waiting.promise);
    const { pending } = select(render(), source);
    await Promise.resolve();
    const signal = h.read.mock.calls[0]![1] as AbortSignal;
    cleanup?.(); cleanup = undefined; expect(signal.aborted).toBe(true);
    waiting.resolve(prepared); await pending;
    expect(h.create).not.toHaveBeenCalled(); expect(h.change).not.toHaveBeenCalled(); expect(h.upload).not.toHaveBeenCalled();
    expect(h.busy.mock.calls).toEqual([[true]]);
  });
  it("removes the selected file and revokes its preview", async () => {
    await select(render(), source).pending;
    find(render(prepared), (props) => props.children === "사진 제거")!.onClick!();
    expect(h.change).toHaveBeenLastCalledWith(null, true); expect(h.forget).toHaveBeenCalledWith("blob:first");
    expect(find(render(), (props) => !!props.src)).toBeNull(); expect(h.upload).not.toHaveBeenCalled();
  });
  it("recovers from failed preparation on explicit retake", async () => {
    h.prepare.mockRejectedValueOnce({ code: "photo/processing-failed" });
    const first = select(render(), source); await first.pending;
    expect(first.input.value).toBe(""); expect(find(render(), (props) => props.role === "alert")).not.toBeNull();
    expect(h.change).not.toHaveBeenCalled(); expect(h.busy).toHaveBeenLastCalledWith(false);
    await select(render(), source).pending;
    expect(h.change).toHaveBeenCalledExactlyOnceWith(prepared, false);
    expect(find(render(prepared), (props) => props.role === "alert")).toBeNull(); expect(h.upload).not.toHaveBeenCalled();
  });
  it("keeps the native input until materialization finishes and rejects a concurrent selection", async () => {
    const waiting = deferred<File>(); h.read.mockReturnValueOnce(waiting.promise);
    const tree = render(); const first = select(tree, source);
    await select(tree, source).pending; expect(h.read).toHaveBeenCalledTimes(1); expect(first.input.value).toBe("native-camera-file");
    waiting.resolve(source); await first.pending;
    expect(first.input.value).toBe(""); expect(h.change).toHaveBeenCalledExactlyOnceWith(prepared, false); expect(h.upload).not.toHaveBeenCalled();
  });
});
