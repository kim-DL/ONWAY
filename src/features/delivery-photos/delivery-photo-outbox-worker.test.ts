import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoOutboxStore } from "./delivery-photo-outbox";
import { PhotoOutboxWorker } from "./delivery-photo-outbox-worker";

const workers: PhotoOutboxWorker[] = [];

function documentLifetime() {
  vi.useFakeTimers();
  const viewport = Object.assign(new EventTarget(), { location: { reload: vi.fn() } });
  const page = Object.assign(new EventTarget(), { visibilityState: "hidden" });
  vi.stubGlobal("window", viewport);
  vi.stubGlobal("document", page);
  const store: PhotoOutboxStore = {
    activate: vi.fn(async (owner) => ({ owner, token: "scope-token" })),
    list: vi.fn(async () => []),
    add: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    claim: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const worker = new PhotoOutboxWorker(store, "lifecycle-test-worker");
  workers.push(worker);
  return { worker, store, viewport, page };
}

afterEach(() => {
  for (const worker of workers.splice(0)) worker.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("photo outbox simulated document lifecycle", () => {
  it.each(["visibilitychange", "focus", "resume"])("rechecks pending photos on %s without waiting for polling", async (eventName) => {
    const { worker, viewport, page } = documentLifetime();
    const wake = vi.fn();
    worker.start(wake, vi.fn(), () => false, 3_000);
    page.visibilityState = "visible";
    (eventName === "focus" ? viewport : page).dispatchEvent(new Event(eventName));
    await Promise.resolve();
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith(true);
  });

  it("keeps an upload eligible to progress when the document becomes hidden", async () => {
    const { worker, viewport, page } = documentLifetime();
    const wake = vi.fn();
    const suspend = vi.fn();
    worker.start(wake, suspend, () => false, 3_000);
    page.dispatchEvent(new Event("visibilitychange"));
    page.dispatchEvent(new Event("resume"));
    viewport.dispatchEvent(new Event("focus"));
    expect(suspend).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith(false);
  });

  it("wakes on reconnect even when the document is still hidden", () => {
    const { worker, viewport } = documentLifetime();
    const wake = vi.fn();
    worker.start(wake, vi.fn(), () => false, 3_000);
    viewport.dispatchEvent(new Event("online"));
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith(true);
  });

  it("stops lifecycle notifications and polling when the worker closes", async () => {
    const { worker, viewport, page } = documentLifetime();
    const wake = vi.fn();
    worker.start(wake, vi.fn(), () => false, 3_000);
    worker.close();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    page.dispatchEvent(new Event("resume"));
    viewport.dispatchEvent(new Event("focus"));
    viewport.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wake).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("suspends on pagehide and reloads only a restored back-forward document", async () => {
    const { worker, viewport } = documentLifetime();
    const wake = vi.fn();
    const suspend = vi.fn();
    worker.start(wake, suspend, () => false, 3_000);
    viewport.dispatchEvent(new Event("pagehide"));
    expect(suspend).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wake).not.toHaveBeenCalled();
    viewport.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    expect(viewport.location.reload).not.toHaveBeenCalled();
    viewport.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(viewport.location.reload).toHaveBeenCalledTimes(1);
  });

  it("does not overlap durable reads when reconnect and foreground events arrive together", async () => {
    const { worker, store, viewport, page } = documentLifetime();
    let finish!: () => void;
    vi.mocked(store.list).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve([]); }));
    const restore = () => worker.restore({
      jobs: new Map(), active: new Set(), today: "2026-11-04", now: Date.now(),
      live: () => true, accept: vi.fn(), remove: vi.fn(),
    });
    worker.start(() => { void restore(); }, vi.fn(), () => false, 3_000);
    viewport.dispatchEvent(new Event("online"));
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    viewport.dispatchEvent(new Event("focus"));
    page.dispatchEvent(new Event("resume"));
    await Promise.resolve();
    expect(store.list).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    viewport.dispatchEvent(new Event("focus"));
    expect(store.list).toHaveBeenCalledTimes(2);
  });
});
