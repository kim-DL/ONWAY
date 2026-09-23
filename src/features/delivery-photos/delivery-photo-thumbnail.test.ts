import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  host: { current: {} as unknown }, image: vi.fn(), retry: vi.fn(),
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(harness.states[index]) : next; }];
  },
  useRef: () => harness.host,
  useEffect: (run: () => void | (() => void)) => harness.effects.push(run),
}));
vi.mock("./use-delivery-photo-image", () => ({ useDeliveryPhotoImage: (...input: unknown[]) => harness.image(...input) }));

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { DeliveryPhotoThumbnail } from "./delivery-photo-thumbnail";

const photo: DeliveryPhotoMetadata = { photoId: "eb12d3e0-35f3-400e-9165-32938939afc8", customerId: "customer-a",
  deliveryDateKey: "2026-09-24", source: "camera", createdAt: "2026-09-24T01:42:00.000Z",
  createdByEmployeeId: "employee_1", createdByName: "홍길동", expiresAt: "2026-10-01T01:42:00.000Z",
  thumbnail: { width: 640, height: 480 } };
const session: AuthenticatedSession = { uid: "uid_1", displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };
class Observer {
  static instances: Observer[] = [];
  observe = vi.fn(); disconnect = vi.fn();
  constructor(readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) { Observer.instances.push(this); }
  emit(visible: boolean) { this.callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
function renderThumbnail() {
  harness.cursor = 0; harness.effects = [];
  return DeliveryPhotoThumbnail({ photo, customerName: "한빛유통", session, onOpen: vi.fn() });
}

beforeEach(() => {
  harness.states = []; harness.cursor = 0; harness.effects = []; harness.host.current = {};
  harness.image.mockReset().mockImplementation((_id, _variant, _session, enabled) => enabled
    ? { status: "loading", url: null, retry: harness.retry, fail: vi.fn() }
    : { status: "idle", url: null, retry: harness.retry, fail: vi.fn() });
  harness.retry.mockReset(); Observer.instances = [];
  vi.stubGlobal("IntersectionObserver", Observer);
});
afterEach(() => vi.unstubAllGlobals());

describe("delivery photo lazy thumbnail", () => {
  it("keeps an offscreen card idle and enables only after viewport entry", () => {
    renderThumbnail(); const cleanup = harness.effects[0]!();
    const observer = Observer.instances[0]!;
    expect(observer.options).toEqual({ rootMargin: "160px 0px", threshold: 0 });
    expect(harness.image).toHaveBeenLastCalledWith(photo.photoId, "thumbnail", session, false);
    observer.emit(false); renderThumbnail();
    expect(harness.image).toHaveBeenLastCalledWith(photo.photoId, "thumbnail", session, false);
    observer.emit(true); renderThumbnail();
    expect(harness.image).toHaveBeenLastCalledWith(photo.photoId, "thumbnail", session, true);
    expect(observer.disconnect).toHaveBeenCalled();
    cleanup?.();
  });

  it("exposes an in-card thumbnail retry without any delete action", () => {
    harness.states = [true];
    harness.image.mockReturnValue({ status: "error", url: null, message: "미리보기 실패", retry: harness.retry, fail: vi.fn() });
    const tree = renderThumbnail();
    const children = tree.props.children as Array<{ props?: { children?: unknown; onClick?: () => void } } | null>;
    const retry = children.find((child) => child?.props?.children === "미리보기 다시 불러오기");
    retry?.props?.onClick?.();
    expect(harness.retry).toHaveBeenCalledOnce();
    expect(JSON.stringify(tree)).not.toContain("삭제");
  });
});
