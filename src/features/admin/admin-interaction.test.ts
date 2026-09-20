import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void) | void>,
  showToast: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | void) => { harness.effects.push(effect); },
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: harness.showToast }) }));

import { AdminInteractionProvider } from "./admin-interaction";

function interaction() {
  return AdminInteractionProvider({ children: "관리자 화면" }).props.value;
}

beforeEach(() => {
  harness.effects = [];
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("administrator pending-interaction guard", () => {
  it("permits ordinary navigation without showing a warning", () => {
    expect(interaction().canNavigate()).toBe(true);
    expect(harness.showToast).not.toHaveBeenCalled();
  });

  it("synchronously blocks a second action and navigation until the first releases", () => {
    const api = interaction();
    const release = api.begin();
    expect(release).toBeTypeOf("function");
    expect(api.begin()).toBeNull();
    expect(api.canNavigate()).toBe(false);
    expect(harness.showToast).toHaveBeenCalledWith("진행 중인 작업을 마치고 결과를 확인해주세요.");
    release!();
    expect(api.canNavigate()).toBe(true);
    const nextRelease = api.begin();
    expect(nextRelease).toBeTypeOf("function");
    nextRelease!();
    expect(api.canNavigate()).toBe(true);
  });

  it("protects an in-flight operation from browser unload and stops prompting after release", () => {
    const api = interaction();
    const listeners = new Map<string, (event: { preventDefault: () => void; returnValue: string | undefined }) => void>();
    const addEventListener = vi.fn((type: string, listener: (event: { preventDefault: () => void; returnValue: string | undefined }) => void) => listeners.set(type, listener));
    const removeEventListener = vi.fn((type: string) => listeners.delete(type));
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    const cleanup = harness.effects[0]!();
    expect(addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    const listener = listeners.get("beforeunload")!;

    const idle = { preventDefault: vi.fn(), returnValue: undefined as string | undefined };
    listener(idle);
    expect(idle.preventDefault).not.toHaveBeenCalled();
    expect(idle.returnValue).toBeUndefined();

    const release = api.begin()!;
    const pending = { preventDefault: vi.fn(), returnValue: undefined as string | undefined };
    listener(pending);
    expect(pending.preventDefault).toHaveBeenCalledOnce();
    expect(pending.returnValue).toBe("");

    release();
    const completed = { preventDefault: vi.fn(), returnValue: undefined as string | undefined };
    listener(completed);
    expect(completed.preventDefault).not.toHaveBeenCalled();
    expect(completed.returnValue).toBeUndefined();
    cleanup!();
    expect(removeEventListener).toHaveBeenCalledWith("beforeunload", listener);
    expect(listeners.has("beforeunload")).toBe(false);
  });

  it("does not retain a beforeunload listener when unmounted during an operation", () => {
    const api = interaction();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    const cleanup = harness.effects[0]!();
    api.begin();
    cleanup!();
    expect(removeEventListener).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith("beforeunload", addEventListener.mock.calls[0]![1]);
  });
});
