import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryProduct } from "@/domain/inventory";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0,
  effects: [] as Array<{ run: () => void | (() => void); dependencies: unknown[] }>,
  host: { current: {} as unknown },
  authenticated: true, uid: "employee-1", permissionsVersion: 1,
  photo: vi.fn(), create: vi.fn(), register: vi.fn(), forget: vi.fn(),
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }];
  },
  useRef: () => harness.host,
  useEffect: (run: () => void | (() => void), dependencies: unknown[]) => harness.effects.push({ run, dependencies }),
}));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ state: harness.authenticated ? { status: "authenticated", session: { uid: harness.uid, claims: { sessionVersion: 1, permissionsVersion: harness.permissionsVersion } } } : { status: "unauthenticated" } }) }));
vi.mock("@/features/auth/private-client-state", () => ({ registerPrivateBlobUrl: (url: string) => { harness.register(url); return url; }, forgetPrivateBlobUrl: harness.forget }));
vi.mock("./inventory-repository", () => ({ inventoryRepository: { photo: harness.photo } }));
import { InventoryThumbnail } from "./inventory-thumbnail";

const photoId = "37f53804-77f5-49e7-82ae-bdbf7c6f7bc9";
const product = { productId: "product-1", name: "검증용 만두", photo: { photoId, width: 200, height: 160 } } as InventoryProduct;
const response = { contentType: "image/webp", byteSize: 3, fileBase64: "YWJj" };
class Observer {
  static instances: Observer[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) { Observer.instances.push(this); }
  emit(visible: boolean) { this.callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
function render(next = product) {
  harness.cursor = 0; harness.effects = [];
  return InventoryThumbnail({ product: next });
}
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
function imageProps(tree: ReactNode) {
  if (!isValidElement<{ children?: ReactNode }>(tree)) return null;
  const child = tree.props.children;
  return isValidElement<{ onError: () => void; src: string }>(child) && child.type === "img" ? child.props : null;
}
beforeEach(() => {
  harness.states = []; harness.cursor = 0; harness.effects = []; harness.host.current = {};
  harness.authenticated = true; harness.uid = "employee-1"; harness.permissionsVersion = 1;
  harness.photo.mockReset().mockResolvedValue(response);
  harness.create.mockReset().mockReturnValue("blob:inventory-thumbnail");
  harness.register.mockReset(); harness.forget.mockReset(); Observer.instances = [];
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("URL", { createObjectURL: harness.create });
});
afterEach(() => vi.unstubAllGlobals());

describe("private inventory thumbnail", () => {
  it("renders a non-interactive SSR-safe placeholder inside the card button without fetching", () => {
    const html = renderToStaticMarkup(createElement("button", null, createElement(InventoryThumbnail, { product })));
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('data-inventory-photo="placeholder"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<img");
    expect(harness.photo).not.toHaveBeenCalled();
  });

  it("requests only near-viewport thumbnails once and registers/revokes the private URL", async () => {
    render(); const cleanup = harness.effects[0]!.run() as () => void;
    const observer = Observer.instances[0]!;
    expect(observer.options).toEqual({ rootMargin: "120px 0px", threshold: 0 });
    observer.emit(false); expect(harness.photo).not.toHaveBeenCalled();
    observer.emit(true); observer.emit(true); await settle();
    expect(harness.photo.mock.calls).toEqual([[product.productId, photoId, "thumbnail"]]);
    expect(harness.register).toHaveBeenCalledWith("blob:inventory-thumbnail");
    expect(imageProps(render())?.src).toBe("blob:inventory-thumbnail");
    cleanup(); expect(harness.forget).toHaveBeenCalledWith("blob:inventory-thumbnail");
  });

  it("does not fetch an offscreen catalog, missing photos, signed-out cards or unsupported observers", () => {
    for (let index = 0; index < 1000; index += 1) {
      render({ ...product, productId: `product-${index}` }); harness.effects[0]!.run();
    }
    expect(Observer.instances).toHaveLength(1000);
    expect(harness.photo).not.toHaveBeenCalled();
    render({ ...product, photo: null }); harness.effects[0]!.run();
    harness.authenticated = false; render(); harness.effects[0]!.run();
    harness.authenticated = true; vi.stubGlobal("IntersectionObserver", undefined); render(); harness.effects[0]!.run();
    expect(Observer.instances).toHaveLength(1000);
    expect(harness.photo).not.toHaveBeenCalled();
  });

  it("never creates a URL for bytes arriving after unmount or a queued observer callback after cleanup", async () => {
    let resolve!: (photo: typeof response) => void;
    harness.photo.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(); const cleanup = harness.effects[0]!.run() as () => void;
    Observer.instances[0]!.emit(true); cleanup(); resolve(response); await settle();
    expect(harness.create).not.toHaveBeenCalled();
    render(); const otherCleanup = harness.effects[0]!.run() as () => void;
    otherCleanup(); Observer.instances[1]!.emit(true);
    expect(harness.photo).toHaveBeenCalledTimes(1);
  });

  it("hides old bytes immediately on account, permission, photo or logout changes", async () => {
    render(); const cleanup = harness.effects[0]!.run() as () => void;
    Observer.instances[0]!.emit(true); await settle();
    expect(imageProps(render())).not.toBeNull();
    harness.permissionsVersion = 2; expect(imageProps(render())).toBeNull();
    harness.permissionsVersion = 1; harness.uid = "other-employee"; expect(imageProps(render())).toBeNull();
    harness.uid = "employee-1"; expect(imageProps(render({ ...product, photo: { ...product.photo!, photoId: "b7f4ff07-3df6-4bdf-b318-c450cba6f9ad" } }))).toBeNull();
    harness.authenticated = false; expect(imageProps(render())).toBeNull();
    cleanup(); expect(harness.forget).toHaveBeenCalledWith("blob:inventory-thumbnail");
  });

  it("keeps the same request identity when only a product name or quantity changes", () => {
    render(); const dependencies = harness.effects[0]!.dependencies;
    render({ ...product, name: "다른 표시 이름", stockRevision: 2 });
    expect(harness.effects[0]!.dependencies).toEqual(dependencies);
  });

  it.each(["permission-denied", "unavailable"])("retains the quiet fallback after %s without leaking provider details", async (code) => {
    harness.photo.mockRejectedValue({ code, message: "private provider diagnostics" });
    render(); harness.effects[0]!.run(); Observer.instances[0]!.emit(true); await settle();
    const tree = render();
    expect(tree.props["data-inventory-photo"]).toBe("placeholder");
    expect(imageProps(tree)).toBeNull();
    expect(harness.create).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(tree)).not.toContain("private provider");
  });

  it("rejects malformed bytes and removes a broken browser image without blocking the card", async () => {
    harness.photo.mockResolvedValueOnce({ ...response, byteSize: 99 });
    render(); harness.effects[0]!.run(); Observer.instances[0]!.emit(true); await settle();
    expect(harness.create).not.toHaveBeenCalled();
    render(); harness.effects[0]!.run(); Observer.instances[1]!.emit(true); await settle();
    imageProps(render())!.onError();
    expect(harness.forget).toHaveBeenCalledWith("blob:inventory-thumbnail");
    expect(imageProps(render())).toBeNull();
  });
});
