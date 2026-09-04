import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

const harness = vi.hoisted(() => ({
  school: null as School | null,
  stateIndex: 0,
  effects: [] as Array<{ effect: () => void; dependencies: readonly unknown[] }>,
  scrollTo: vi.fn(),
}));

// Inspect the actual shell effect and its dependencies without adding a DOM
// renderer. History restoration supplies a cloned School with the same ID.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void, dependencies: readonly unknown[]) => {
    harness.effects.push({ effect, dependencies });
  },
  useState: (initial: unknown) => [harness.stateIndex++ === 2 ? harness.school : initial, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }),
  useMemo: (compute: () => unknown) => compute(),
  useSyncExternalStore: () => null,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/features/pwa/pwa-provider", () => ({ usePwa: vi.fn() }));

import { AppShell } from "./app-shell";

const session = {
  uid: "scroll-test", displayName: "테스트 직원",
  claims: { employeeId: "EMP-SCROLL", roleScopes: ["sales"], sessionVersion: 1, permissionsVersion: 1 },
} as AuthenticatedSession;

function renderScrollEffect(school: School | null) {
  harness.school = school;
  harness.stateIndex = 0;
  const shell = AppShell({ session }) as ReactElement<{
    children: ReactElement<{ session: AuthenticatedSession }>;
  }>;
  harness.effects = [];
  const content = shell.props.children;
  (content.type as (props: { session: AuthenticatedSession }) => unknown)(content.props);
  const effect = harness.effects[0];
  if (!effect) throw new Error("School detail scroll effect is missing");
  return effect;
}

function school(schoolId: string) {
  return { schoolId, name: schoolId } as unknown as School;
}

beforeEach(() => {
  harness.effects = [];
  harness.scrollTo.mockClear();
  vi.stubGlobal("window", { scrollTo: harness.scrollTo });
});

afterEach(() => vi.unstubAllGlobals());

describe("school detail scroll identity", () => {
  it("preserves scroll when sheet Back restores a cloned school", () => {
    const initial = renderScrollEffect(school("SCH-A"));
    initial.effect();
    const restored = renderScrollEffect(school("SCH-A"));

    expect(initial.dependencies).toEqual(["SCH-A"]);
    expect(restored.dependencies).toEqual(initial.dependencies);
    expect(harness.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("still resets scroll when navigating to a different school", () => {
    const first = renderScrollEffect(school("SCH-A"));
    first.effect();
    const second = renderScrollEffect(school("SCH-B"));

    expect(second.dependencies).not.toEqual(first.dependencies);
    second.effect();
    expect(harness.scrollTo).toHaveBeenCalledTimes(2);
    expect(harness.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("does not reset the school list but resets when reopening a school", () => {
    renderScrollEffect(null).effect();
    expect(harness.scrollTo).not.toHaveBeenCalled();
    renderScrollEffect(school("SCH-A")).effect();
    renderScrollEffect(null).effect();
    renderScrollEffect(school("SCH-A")).effect();
    expect(harness.scrollTo).toHaveBeenCalledTimes(2);
  });
});
