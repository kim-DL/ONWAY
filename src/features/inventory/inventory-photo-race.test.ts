import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryProduct } from "@/domain/inventory";
const h = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, effects: [] as Array<() => void | (() => void)>, photo: vi.fn(), create: vi.fn(), forget: vi.fn(), uid: "employee", version: 1 }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = h.cursor++; if (!(i in h.states)) h.states[i] = initial; return [h.states[i], (next: unknown) => { h.states[i] = typeof next === "function" ? next(h.states[i]) : next; }]; },
  useRef: () => ({ current: null }), useEffect: (effect: () => void | (() => void)) => { h.effects.push(effect); },
}));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ state: { status: "authenticated", session: { uid: h.uid, claims: { sessionVersion: 1, permissionsVersion: h.version } } } }) }));
vi.mock("@/features/auth/private-client-state", () => ({ registerPrivateBlobUrl: vi.fn(), forgetPrivateBlobUrl: h.forget }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { photo: h.photo }, inventoryErrorMessage: () => "사진 오류" }));
import { InventoryPhoto } from "./inventory-photo";
import { reportInventoryAccessFailure } from "./inventory-access-boundary";
import { runRegisteredPrivateClientCleanups } from "@/features/auth/private-client-cleanup-registry";
const product = { productId: "A", name: "상품", photo: { photoId: "photo-A", width: 20, height: 20 } } as InventoryProduct;
const response = { contentType: "image/webp", byteSize: 3, fileBase64: "YWJj" };
const cleanups: Array<() => void> = [];
function render(next = product) { h.cursor = 0; h.effects = []; return InventoryPhoto({ product: next, expandable: true }); }
function mount() { const cleanup = h.effects[0]!(); if (cleanup) cleanups.push(cleanup); }
function img(tree: ReactNode): boolean {
  if (Array.isArray(tree)) return tree.some(img);
  return isValidElement<{ children?: ReactNode }>(tree) && (tree.type === "img" || img(tree.props.children));
}
function handler(tree: ReactNode, kind: "retry" | "error"): (() => void) | null {
  if (Array.isArray(tree)) { for (const child of tree) { const found = handler(child, kind); if (found) return found; } return null; }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void; onError?: () => void }>(tree)) return null;
  if (kind === "retry" && tree.props.children === "사진 다시 보기") return tree.props.onClick ?? null;
  if (kind === "error" && tree.type === "img") return tree.props.onError ?? null;
  return handler(tree.props.children, kind);
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
beforeEach(() => { h.states = []; h.uid = "employee"; h.version = 1; h.photo.mockReset().mockResolvedValue(response); h.create.mockReset().mockReturnValue("blob:photo"); h.forget.mockReset(); vi.stubGlobal("URL", { createObjectURL: h.create }); });
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });
describe("inventory detail photo identity", () => {
  it.each(["unavailable", "malformed bytes"])("retries %s without retaining stale error state", async (kind) => {
    if (kind === "unavailable") h.photo.mockRejectedValueOnce({ code: "unavailable" });
    else h.photo.mockResolvedValueOnce({ ...response, byteSize: 99 });
    render(); mount(); await settle();
    const failed = render(); expect(img(failed)).toBe(false); expect(h.create).not.toHaveBeenCalled();
    handler(failed, "retry")!(); cleanups.pop()!(); render(); mount(); await settle();
    expect(img(render())).toBe(true); expect(handler(render(), "retry")).toBeNull();
  });
  it("revokes a browser image failure before retrying", async () => {
    render(); mount(); await settle();
    handler(render(), "error")!();
    expect(h.forget).toHaveBeenCalledWith("blob:photo"); expect(img(render())).toBe(false);
    handler(render(), "retry")!(); cleanups.pop()!(); render(); mount(); await settle();
    expect(img(render())).toBe(true); expect(h.create).toHaveBeenCalledTimes(2);
  });
  it("decodes every byte value without changing the returned private image", async () => {
    const bytes = Buffer.from(Array.from({ length: 8193 }, (_, index) => index % 256));
    h.photo.mockResolvedValue({ ...response, byteSize: bytes.length, fileBase64: bytes.toString("base64") });
    render(); mount(); await settle();
    const blob = h.create.mock.calls[0]![0] as Blob;
    expect(Buffer.from(await blob.arrayBuffer())).toEqual(bytes);
  });
  it.each([{ fileBase64: "%%%", byteSize: 3 }, { fileBase64: "YWJj", byteSize: 4 }])("rejects malformed or size-mismatched photo bytes %j", async (invalid) => {
    h.photo.mockResolvedValue({ ...response, ...invalid });
    render(); mount(); await settle();
    expect(h.create).not.toHaveBeenCalled(); expect(img(render())).toBe(false);
  });
  it("hides previous bytes synchronously when photo, product or permission identity changes", async () => {
    render(); mount(); await settle(); expect(img(render())).toBe(true);
    expect(img(render({ ...product, productId: "B" }))).toBe(false);
    expect(img(render({ ...product, photo: { ...product.photo!, photoId: "photo-B" } }))).toBe(false);
    h.version++; expect(img(render())).toBe(false);
  });
  it.each(["unmount", "private cleanup", "access failure"])("discards a late result after %s", async (kind) => {
    let resolve!: (value: typeof response) => void;
    h.photo.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(); mount();
    if (kind === "unmount") cleanups.pop()!();
    else if (kind === "private cleanup") await runRegisteredPrivateClientCleanups();
    else reportInventoryAccessFailure({ code: "permission-denied" }, h.uid);
    resolve(response); await settle(); expect(h.create).not.toHaveBeenCalled(); expect(img(render())).toBe(false);
  });
  it("revokes visible bytes on access loss and does not let older A overwrite B", async () => {
    let resolveA!: (value: typeof response) => void;
    h.photo.mockImplementationOnce(() => new Promise((done) => { resolveA = done; }));
    render(); mount(); cleanups.pop()!();
    const second = { ...product, productId: "B" }; render(second); mount(); await settle();
    resolveA(response); await settle(); expect(h.create).toHaveBeenCalledTimes(1); expect(img(render(second))).toBe(true);
    reportInventoryAccessFailure({ code: "unauthenticated" }, h.uid);
    expect(img(render(second))).toBe(false); expect(h.forget).toHaveBeenCalledWith("blob:photo");
  });
});
