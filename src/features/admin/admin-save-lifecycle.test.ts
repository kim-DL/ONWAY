import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { AdminWorkspaceData } from "./admin-contract";

type Props = Record<string, unknown>;
type Element = ReactElement<Props>;
type Frame = { values: unknown[]; cursor: number; effects: Array<() => unknown> };

const harness = vi.hoisted(() => ({
  frame: null as Frame | null,
  createEmployee: vi.fn(),
  updateActivityTags: vi.fn(),
  showToast: vi.fn(),
}));

// Reuse the project's Node hook harness pattern: run the actual event handlers
// against deferred repository promises without adding a DOM renderer dependency.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const frame = harness.frame!;
    const index = frame.cursor++;
    if (!(index in frame.values)) frame.values[index] = typeof initial === "function" ? initial() : initial;
    return [frame.values[index], (next: unknown) => {
      frame.values[index] = typeof next === "function" ? next(frame.values[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const frame = harness.frame!;
    const index = frame.cursor++;
    if (!(index in frame.values)) frame.values[index] = { current: initial };
    return frame.values[index];
  },
  useEffect: (effect: () => unknown) => { harness.frame!.effects.push(effect); },
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("./admin-repository", () => ({
  adminRepository: { createEmployee: harness.createEmployee, updateActivityTags: harness.updateActivityTags },
  adminErrorMessage: () => "저장 연결 오류",
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: harness.showToast }) }));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@/features/export/sales-export-workspace", () => ({ SalesExportWorkspace: () => null }));
vi.mock("@/components/assignment/school-assignment-picker", () => ({ SchoolAssignmentPicker: () => null }));

import { AdminWorkspace } from "./admin-workspace";

const data = {
  selectedCycleId: "2026-08", employees: [], schools: [], activityTags: [],
  settings: { minimumAppVersion: null, maintenanceMode: false, currentSalesCycleId: "2026-08", commonCatalogVersion: 1, updatedAt: null },
} as unknown as AdminWorkspaceData;
const session = {
  displayName: "관리자", claims: { employeeId: "EMP-ADMIN" },
} as AuthenticatedSession;

function frame(values: unknown[] = []): Frame { return { values, cursor: 0, effects: [] }; }
function render(element: Element, state = frame()): ReactNode {
  harness.frame = state;
  state.cursor = 0;
  state.effects = [];
  return (element.type as (props: Props) => ReactNode)(element.props);
}
function all(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
function find(node: ReactNode, predicate: (element: Element) => boolean): Element {
  const result = all(node).find(predicate);
  if (!result) throw new Error("Expected admin control was not rendered");
  return result;
}
function component(node: ReactNode, name: string) {
  return find(node, (element) => typeof element.type === "function" && element.type.name === name);
}
function action(node: ReactNode, text: string) {
  return find(node, (element) => element.props.children === text && typeof element.props.onClick === "function");
}
function invoke(element: Element, eventName: string, event?: unknown) {
  return (element.props[eventName] as (event?: unknown) => unknown)(event);
}
function workspacePage(view: "employees" | "settings") {
  const shell = AdminWorkspace({ session }) as Element;
  return render(shell, frame([view, data, "ready", false]));
}
function employeeDialog(onClose: () => void, onCreated: () => Promise<void>) {
  const page = component(workspacePage("employees"), "EmployeesPage");
  const dialog = component(render(page, frame(["", "", true])), "NewEmployeeDialog");
  return { ...dialog, props: { onClose, onCreated } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("admin pending-save controls", () => {
  it("keeps a new employee's dialog and PIN available through create and reload", async () => {
    const create = deferred<void>();
    const reload = deferred<void>();
    harness.createEmployee.mockReturnValue(create.promise);
    const onClose = vi.fn();
    const onCreated = vi.fn(() => reload.promise);
    const dialog = employeeDialog(onClose, onCreated);
    const state = frame(["신규 직원", ["delivery"], false, { reservationId: "reservation-test", pin: "482953" }, "idle"]);
    const initial = render(dialog, state);
    const form = find(initial, (element) => element.type === "form");
    invoke(form, "onSubmit", { preventDefault: vi.fn() });
    invoke(form, "onSubmit", { preventDefault: vi.fn() });
    invoke(initial as Element, "onClose");
    expect(harness.createEmployee).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    const pending = render(dialog, state);
    expect((pending as Element).props.busy).toBe(true);
    expect(action(pending, "취소").props.disabled).toBe(true);
    invoke(action(pending, "취소"), "onClick");
    expect(find(pending, (element) => element.type === "input" && element.props.value === "신규 직원").props.disabled).toBe(true);
    expect(component(pending, "RoleChecks").props.disabled).toBe(true);

    const modalState = frame();
    const modal = render(pending as Element, modalState);
    const listener = vi.fn();
    vi.stubGlobal("window", { addEventListener: listener, removeEventListener: vi.fn() });
    modalState.effects[0]!();
    const preventDefault = vi.fn();
    listener.mock.calls[0]![1]({ key: "Escape", preventDefault });
    const backdrop = {};
    invoke(modal as Element, "onMouseDown", { target: backdrop, currentTarget: backdrop });
    expect(find(modal, (element) => element.props["aria-label"] === "닫기").props.disabled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    create.resolve();
    await flush();
    expect(onCreated).toHaveBeenCalledOnce();
    invoke(render(dialog, state) as Element, "onClose");
    expect(onClose).not.toHaveBeenCalled();
    reload.resolve();
    await flush();
    const complete = render(dialog, state);
    expect((complete as Element).props.title).toBe("직원 등록 완료");
    expect(component(complete, "PinReveal").props.pin).toBe("482953");
    invoke(action(complete, "확인하고 닫기"), "onClick");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("unlocks employee creation after failure without losing the entered name or PIN", async () => {
    harness.createEmployee.mockRejectedValue(new Error("offline"));
    const onClose = vi.fn();
    const dialog = employeeDialog(onClose, vi.fn());
    const state = frame(["실패 후 재시도", ["sales"], false, { reservationId: "reservation-retry", pin: "573829" }, "idle"]);
    invoke(find(render(dialog, state), (element) => element.type === "form"), "onSubmit", { preventDefault: vi.fn() });
    await flush();
    const failed = render(dialog, state);
    expect((failed as Element).props.busy).toBe(false);
    expect(find(failed, (element) => element.type === "input" && element.props.value === "실패 후 재시도").props.disabled).toBe(false);
    expect(component(failed, "PinReveal").props.pin).toBe("573829");
    invoke(action(failed, "취소"), "onClick");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(["success", "failure"] as const)("locks every tag mutation until a %s response settles", async (outcome) => {
    const save = deferred<{ tags: unknown[] }>();
    harness.updateActivityTags.mockReturnValue(save.promise);
    const settingsElement = component(workspacePage("settings"), "SettingsPage");
    const reload = vi.fn(async () => undefined);
    const settings = { ...settingsElement, props: { ...settingsElement.props, onReload: reload } };
    const draft = [{ tagId: "", clientId: "draft-one", label: "새 방문 태그", active: true }];
    const state = frame(["", false, false, draft, false]);
    const initial = render(settings, state);
    const saveAction = action(initial, "활동 태그 저장");
    invoke(saveAction, "onClick");
    invoke(saveAction, "onClick");
    expect(harness.updateActivityTags).toHaveBeenCalledTimes(1);
    const pending = render(settings, state);
    const panel = find(pending, (element) => element.props.className === "admin-panel activity-tag-admin");
    expect(panel.props["aria-busy"]).toBe(true);
    const name = find(panel, (element) => element.type === "input" && element.props.value === "새 방문 태그");
    const toggle = find(panel, (element) => element.type === "input" && element.props.type === "checkbox");
    const remove = find(panel, (element) => element.props["aria-label"] === "새 방문 태그 삭제");
    const add = find(panel, (element) => element.type === "button" && Array.isArray(element.props.children));
    for (const control of [name, toggle, remove, add, action(panel, "태그 반영 중…")]) expect(control.props.disabled).toBe(true);
    // Also exercise already-queued callbacks; disabled DOM state alone is not the guard.
    invoke(name, "onChange", { target: { value: "뒤늦게 바꾼 이름" } });
    invoke(toggle, "onChange", { target: { checked: false } });
    invoke(remove, "onClick");
    invoke(add, "onClick");
    expect(state.values[3]).toEqual(draft);

    if (outcome === "success") save.resolve({ tags: [{ ...draft[0], tagId: "TAG-SAVED" }] });
    else save.reject(new Error("offline"));
    await flush();
    const settled = render(settings, state);
    expect(action(settled, "활동 태그 저장").props.disabled).toBe(false);
    expect(find(settled, (element) => element.type === "input" && element.props.value === "새 방문 태그").props.disabled).toBe(false);
    expect((state.values[3] as Array<{ label: string }>)[0]!.label).toBe("새 방문 태그");
    expect(reload).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
  });
});
