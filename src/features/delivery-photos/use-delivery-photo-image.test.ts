import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0,
  effects: [] as Array<{ run: () => void | (() => void); dependencies: unknown[] }>,
  load: vi.fn(), create: vi.fn(), register: vi.fn(), forget: vi.fn(),
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(harness.states[index]) : next; }];
  },
  useEffect: (run: () => void | (() => void), dependencies: unknown[]) => harness.effects.push({ run, dependencies }),
}));
vi.mock("@/features/auth/private-client-state", () => ({
  registerPrivateBlobUrl: (url: string) => { harness.register(url); return url; },
  forgetPrivateBlobUrl: harness.forget,
}));
vi.mock("./delivery-photo-history-repository", () => ({
  deliveryPhotoHistoryRepository: { load: harness.load },
  deliveryPhotoHistoryErrorMessage: () => "불러오기 실패",
}));

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useDeliveryPhotoImage } from "./use-delivery-photo-image";

const photoId = "eb12d3e0-35f3-400e-9165-32938939afc8";
const session: AuthenticatedSession = { uid: "uid_1", displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };
const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });

function renderHook(currentSession = session, enabled = true, variant: "thumbnail" | "evidence" = "thumbnail") {
  harness.cursor = 0; harness.effects = [];
  // This focused harness executes the hook against deterministic mocked React state.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDeliveryPhotoImage(photoId, variant, currentSession, enabled);
}
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

beforeEach(() => {
  harness.states = []; harness.cursor = 0; harness.effects = [];
  harness.load.mockReset().mockResolvedValue(blob);
  harness.create.mockReset().mockReturnValue("blob:delivery-thumbnail");
  harness.register.mockReset(); harness.forget.mockReset();
  vi.stubGlobal("URL", { createObjectURL: harness.create });
});
afterEach(() => vi.unstubAllGlobals());

describe("delivery photo memory-only image lifecycle", () => {
  it("keeps the relay idle until enabled, then registers and revokes its URL", async () => {
    expect(renderHook(session, false).status).toBe("idle");
    expect(harness.effects[0]!.run()).toBeUndefined();
    expect(harness.load).not.toHaveBeenCalled();
    renderHook(); const cleanup = harness.effects[0]!.run() as () => void; await settle();
    expect(harness.load).toHaveBeenCalledWith(photoId, "thumbnail", session, expect.any(AbortSignal));
    expect(renderHook()).toMatchObject({ status: "ready", url: "blob:delivery-thumbnail" });
    cleanup(); expect(harness.forget).toHaveBeenCalledWith("blob:delivery-thumbnail");
  });

  it.each(["thumbnail", "evidence"] as const)("never promotes a late %s response after deletion unmounts it", async (variant) => {
    let resolve!: (value: Blob) => void;
    harness.load.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    renderHook(session, true, variant); const cleanup = harness.effects[0]!.run() as () => void;
    cleanup(); resolve(blob); await settle();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("moves a failed relay into a fresh memory-only retry attempt", async () => {
    harness.load.mockRejectedValueOnce({ code: "unavailable" });
    renderHook(); harness.effects[0]!.run(); await settle();
    const failed = renderHook();
    expect(failed).toMatchObject({ status: "error", url: null, message: "불러오기 실패" });
    failed.retry();
    expect(renderHook()).toMatchObject({ status: "loading", url: null });
    harness.effects[0]!.run(); await settle();
    expect(harness.load).toHaveBeenCalledTimes(2);
    expect(renderHook()).toMatchObject({ status: "ready", url: "blob:delivery-thumbnail" });
  });

  it("hides a prior session URL and revokes broken browser images", async () => {
    renderHook(); const cleanup = harness.effects[0]!.run() as () => void; await settle();
    expect(renderHook().status).toBe("ready");
    const changed = { ...session, claims: { ...session.claims, permissionsVersion: 2 } };
    expect(renderHook(changed).status).toBe("loading");
    const ready = renderHook(); ready.fail();
    expect(harness.forget).toHaveBeenCalledWith("blob:delivery-thumbnail");
    expect(renderHook()).toMatchObject({ status: "error", url: null });
    cleanup();
  });
});
