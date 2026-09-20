import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { AdminEmployee, AdminWorkspaceData, NeisPreview } from "./admin-contract";
import type { AdminView } from "./admin-navigation";

type Props = Record<string, unknown>;
type Element = ReactElement<Props>;
type Frame = { values: unknown[]; cursor: number; effects: Array<() => unknown> };

const harness = vi.hoisted(() => ({
  frame: null as Frame | null,
  createEmployee: vi.fn(),
  updateActivityTags: vi.fn(),
  load: vi.fn(),
  previewNeis: vi.fn(),
  applyNeis: vi.fn(),
  rotatePin: vi.fn(),
  begin: vi.fn<() => (() => void) | null>(),
  canNavigate: vi.fn<() => boolean>(),
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
  useId: () => `admin-dialog-test-${harness.frame!.cursor++}`,
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("./admin-repository", () => ({
  adminRepository: {
    createEmployee: harness.createEmployee, updateActivityTags: harness.updateActivityTags,
    load: harness.load, previewNeis: harness.previewNeis, applyNeis: harness.applyNeis, rotatePin: harness.rotatePin,
  },
  adminErrorMessage: () => "저장 연결 오류",
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: harness.showToast }) }));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("./admin-interaction", () => ({
  useAdminInteraction: () => ({ begin: harness.begin, canNavigate: harness.canNavigate }),
  AdminInteractionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/export/sales-export-workspace", () => ({ SalesExportWorkspace: () => null }));
vi.mock("@/components/assignment/school-assignment-picker", () => ({ SchoolAssignmentPicker: () => null }));

import { AdminWorkspace } from "./admin-workspace";

const data = {
  generatedAt: "2026-09-08T00:00:00.000Z",
  selectedCycleId: "2026-08", employees: [], schools: [], activityTags: [],
  cycles: [], assignments: [], zones: [], syncRuns: [], kakaoReviews: [], audits: [],
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
  return find(node, (element) => (element.props.children === text || Array.isArray(element.props.children) && element.props.children.includes(text))
    && typeof element.props.onClick === "function");
}
function invoke(element: Element, eventName: string, event?: unknown) {
  return (element.props[eventName] as (event?: unknown) => unknown)(event);
}
function workspaceElement() {
  const shell = AdminWorkspace({ session }) as Element;
  return component(shell, "AdminWorkspaceContent");
}
function workspacePage(view: AdminView, workspaceData = data) {
  return render(workspaceElement(), frame([view, workspaceData, "ready", false]));
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

beforeEach(() => {
  vi.resetAllMocks();
  harness.begin.mockImplementation(() => vi.fn());
  harness.canNavigate.mockReturnValue(true);
});
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

    const sheet = render(pending as Element) as Element;
    expect(sheet.props.dismissible).toBe(false);
    expect((sheet.props.beforeClose as () => boolean)()).toBe(false);
    const modal = render(sheet) as Element;
    expect(modal.type).toBe("dialog");
    const preventDefault = vi.fn();
    // Escape is a native modal cancel event; prevent it from closing a save.
    invoke(modal, "onCancel", { preventDefault, stopPropagation: vi.fn() });
    const backdrop = {};
    invoke(modal, "onMouseDown", { target: backdrop, currentTarget: backdrop });
    const closeButton = find(modal, (element) => element.props["aria-label"] === "닫기");
    expect(closeButton.props.disabled).toBe(true);
    invoke(closeButton, "onClick");
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

describe("admin workspace request and navigation safety", () => {
  it.each(["success", "failure"] as const)("ignores an older Cycle response after a newer request succeeds (%s)", async (outcome) => {
    const older = deferred<AdminWorkspaceData>();
    const newer = deferred<AdminWorkspaceData>();
    harness.load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const state = frame(["cycles", data, "ready", false]);
    const tree = render(workspaceElement(), state);
    const cycle = component(tree, "CyclesPage");
    const loadCycle = cycle.props.onLoadCycle as (cycleId: string) => Promise<void>;
    const olderRequest = loadCycle("2026-08");
    const newerRequest = loadCycle("2026-09");
    const latest = { ...data, selectedCycleId: "2026-09" };
    newer.resolve(latest);
    await newerRequest;
    expect(state.values[1]).toBe(latest);
    expect(state.values[3]).toBe(false);
    if (outcome === "success") older.resolve({ ...data, selectedCycleId: "2026-08" });
    else older.reject(new Error("obsolete request failed"));
    await olderRequest;
    expect(state.values[1]).toBe(latest);
    expect(state.values[2]).toBe("ready");
    expect(state.values[4]).toBe(false);
    expect(harness.showToast).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"] as const)("suppresses initial and refresh results after unmount (%s)", async (outcome) => {
    const initial = deferred<AdminWorkspaceData>();
    const refresh = deferred<AdminWorkspaceData>();
    harness.load.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refresh.promise);
    const state = frame(["cycles", data, "ready", false]);
    const tree = render(workspaceElement(), state);
    const cleanup = state.effects[0]!() as () => void;
    const loading = (component(tree, "CyclesPage").props.onLoadCycle as (id: string) => Promise<void>)("2026-09");
    cleanup();
    const stateAtUnmount = state.values.slice(0, 5);
    if (outcome === "success") {
      initial.resolve({ ...data, selectedCycleId: "2026-07" });
      refresh.resolve({ ...data, selectedCycleId: "2026-09" });
    } else {
      initial.reject(new Error("initial failed after unmount"));
      refresh.reject(new Error("refresh failed after unmount"));
    }
    await loading;
    await flush();
    expect(state.values.slice(0, 5)).toEqual(stateAtUnmount);
    expect(harness.showToast).not.toHaveBeenCalled();
  });

  it("keeps previous data but clearly announces a failed silent refresh", async () => {
    harness.load.mockRejectedValue(new Error("offline"));
    const state = frame(["cycles", data, "ready", false]);
    const element = workspaceElement();
    const tree = render(element, state);
    await (component(tree, "CyclesPage").props.onLoadCycle as (id: string) => Promise<void>)("2026-09");
    expect(state.values[1]).toBe(data);
    expect(state.values[2]).toBe("ready");
    expect(state.values[3]).toBe(false);
    const refreshed = render(element, state);
    expect(find(refreshed, (node) => node.props.role === "alert").props.className).toBe("admin-refresh-note");
    expect(find(refreshed, (node) => typeof node.props.children === "string"
      && node.props.children.includes("이전에 확인한 정보")).props.children).toContain("이전에 확인한 정보");
  });

  it("routes navigation through the pending-operation guard and permits it after release", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollTo });
    const state = frame(["overview", data, "ready", false]);
    const element = workspaceElement();
    const tree = render(element, state);
    const navigate = component(tree, "AdminNavigation").props.onNavigate as (view: AdminView) => void;
    harness.canNavigate.mockReturnValue(false);
    navigate("employees");
    expect(harness.canNavigate).toHaveBeenCalledOnce();
    expect(state.values[0]).toBe("overview");
    expect(scrollTo).not.toHaveBeenCalled();
    harness.canNavigate.mockReturnValue(true);
    navigate("employees");
    expect(state.values[0]).toBe("employees");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });
});

describe("admin preview and one-time security results", () => {
  const previousPreview: NeisPreview = {
    runId: "old-preview", status: "PREVIEWED", sourceCount: 2, newCount: 0, changedCount: 1,
    missingCount: 0, appliedCount: 0, errorCount: 0, suspiciousReasons: [], replayed: false,
    changes: [{ changeId: "old-risk", type: "ADDRESS_CHANGED", schoolId: "SCHOOL", schoolCode: "SCHOOL", oldData: null, newData: { name: "테스트 학교" }, approved: null, applied: false }],
  };

  it("requires a fresh risky-change acknowledgement for every new successful preview", async () => {
    const pending = deferred<NeisPreview>();
    harness.previewNeis.mockReturnValue(pending.promise);
    const page = component(workspacePage("sync"), "SyncPage");
    const state = frame(["neis", previousPreview, new Set(["old-risk"]), true, false]);
    invoke(action(render(page, state), "최신 목록 가져와 비교"), "onClick");
    const nextPreview: NeisPreview = { ...previousPreview, runId: "next-preview", changes: [
      { ...previousPreview.changes[0]!, changeId: "next-risk" },
      { ...previousPreview.changes[0]!, changeId: "next-safe", type: "PHONE_CHANGED" },
    ] };
    pending.resolve(nextPreview);
    await flush();
    expect(state.values[1]).toBe(nextPreview);
    expect(state.values[2]).toEqual(new Set(["next-safe"]));
    expect(state.values[3]).toBe(false);
    invoke(action(render(page, state), "전체 선택"), "onClick");
    const apply = action(render(page, state), "선택 항목 적용");
    expect(apply.props.disabled).toBe(true);
    invoke(apply, "onClick");
    expect(harness.applyNeis).not.toHaveBeenCalled();
  });

  it("retains a rotated PIN and its interaction lock until the result is acknowledged", async () => {
    const employee: AdminEmployee = { employeeId: "EMP-TEST", displayName: "검증 직원", roleScopes: ["sales"], exportTeam: false,
      status: "active", sessionVersion: 1, permissionsVersion: 1, createdAt: null, updatedAt: null };
    const employees = component(workspacePage("employees", { ...data, employees: [employee] }), "EmployeesPage");
    const detailElement = component(render(employees), "EmployeeDetail");
    const rotated = deferred<{ employeeId: string; pin: string; sessionRevoked: boolean }>();
    const reloaded = deferred<void>();
    const release = vi.fn();
    harness.begin.mockReturnValue(release);
    harness.rotatePin.mockReturnValue(rotated.promise);
    const onReload = vi.fn(() => reloaded.promise);
    const detail = { ...detailElement, props: { ...detailElement.props, onReload } };
    const state = frame();
    const initial = render(detail, state);
    const openPin = find(initial, (node) => node.type === "button" && all(node.props.children as ReactNode)
      .some((child) => child.props.children === "PIN 재발급"));
    invoke(openPin, "onClick");
    const confirmation = component(render(detail, state), "AdminDialog");
    invoke(action(confirmation, "PIN 재발급"), "onClick");
    invoke(action(confirmation, "취소"), "onClick");
    invoke(confirmation, "onClose");
    expect(harness.rotatePin).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
    expect(component(render(detail, state), "AdminDialog").props.busy).toBe(true);

    rotated.resolve({ employeeId: employee.employeeId, pin: "638527", sessionRevoked: true });
    await flush();
    expect(onReload).not.toHaveBeenCalled();
    const complete = component(render(detail, state), "AdminDialog");
    expect(complete.props.title).toBe("새 PIN을 확인해주세요.");
    expect(complete.props.busy).toBe(false);
    expect(component(complete, "PinReveal").props.pin).toBe("638527");
    expect(release).not.toHaveBeenCalled();
    invoke(action(complete, "확인하고 닫기"), "onClick");
    expect(onReload).toHaveBeenCalledOnce();
    const reloading = component(render(detail, state), "AdminDialog");
    expect(reloading.props.busy).toBe(true);
    expect(component(reloading, "PinReveal").props.pin).toBe("638527");
    invoke(action(complete, "확인하고 닫기"), "onClick");
    invoke(reloading, "onClose");
    expect(onReload).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    reloaded.resolve();
    await flush();
    expect(release).toHaveBeenCalledOnce();
    expect(all(render(detail, state)).some((node) => typeof node.type === "function" && node.type.name === "AdminDialog")).toBe(false);
  });

  function pinDetail(onReload: () => Promise<void>) {
    const employee: AdminEmployee = { employeeId: "EMP-TEST", displayName: "검증 직원", roleScopes: ["sales"], exportTeam: false,
      status: "active", sessionVersion: 1, permissionsVersion: 1, createdAt: null, updatedAt: null };
    const page = component(workspacePage("employees", { ...data, employees: [employee] }), "EmployeesPage");
    const pageState = frame(["검증", employee.employeeId, false]);
    const original = component(render(page, pageState), "EmployeeDetail");
    const detail = { ...original, props: { ...original.props, onReload } };
    const state = frame();
    const initial = render(detail, state);
    const unmount = state.effects[0]!() as () => void;
    invoke(find(initial, (node) => node.type === "button" && all(node.props.children as ReactNode)
      .some((child) => child.props.children === "PIN 재발급")), "onClick");
    const confirmation = component(render(detail, state), "AdminDialog");
    invoke(action(confirmation, "PIN 재발급"), "onClick");
    return { employee, page, pageState, detail, state, unmount };
  }

  it("acknowledges the PIN before a renamed employee can leave the current search", async () => {
    let locked = false;
    harness.begin.mockImplementation(() => {
      locked = true;
      return () => { locked = false; };
    });
    harness.canNavigate.mockImplementation(() => !locked);
    harness.rotatePin.mockResolvedValue({ employeeId: "EMP-TEST", pin: "638527", sessionRevoked: true });
    const reloaded = deferred<void>();
    let refreshPage: () => void = () => {};
    const onReload = vi.fn(async () => { await reloaded.promise; refreshPage(); });
    const prepared = pinDetail(onReload);
    let currentPage = prepared.page;
    refreshPage = () => {
      currentPage = { ...prepared.page, props: { ...prepared.page.props,
        data: { ...data, employees: [{ ...prepared.employee, displayName: "이름 변경 직원" }] } } };
      // Model React removing the keyed detail after the refreshed employee no
      // longer matches the current query. Its cleanup must release the lock.
      expect(all(render(currentPage, prepared.pageState)).some((node) =>
        typeof node.type === "function" && node.type.name === "EmployeeDetail")).toBe(false);
      prepared.unmount();
    };
    await flush();
    expect(onReload).not.toHaveBeenCalled();
    expect(component(render(currentPage, prepared.pageState), "EmployeeDetail").props.employee).toBe(prepared.employee);
    const result = component(render(prepared.detail, prepared.state), "AdminDialog");
    expect(component(result, "PinReveal").props.pin).toBe("638527");
    expect(harness.canNavigate()).toBe(false);

    invoke(action(result, "확인하고 닫기"), "onClick");
    expect(onReload).toHaveBeenCalledOnce();
    expect(component(render(prepared.detail, prepared.state), "AdminDialog").props.busy).toBe(true);
    expect(harness.canNavigate()).toBe(false);
    reloaded.resolve();
    await flush();
    expect(harness.canNavigate()).toBe(true);
    expect(harness.rotatePin).toHaveBeenCalledOnce();
  });

  it("releases the acknowledged PIN lock when refreshing the employee fails", async () => {
    const release = vi.fn();
    harness.begin.mockReturnValue(release);
    harness.rotatePin.mockResolvedValue({ employeeId: "EMP-TEST", pin: "638527", sessionRevoked: true });
    const onReload = vi.fn().mockRejectedValue(new Error("refresh unavailable"));
    const { detail, state } = pinDetail(onReload);
    await flush();
    const result = component(render(detail, state), "AdminDialog");
    invoke(action(result, "확인하고 닫기"), "onClick");
    await flush();
    expect(onReload).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(harness.showToast).toHaveBeenLastCalledWith("저장 연결 오류");
    expect(all(render(detail, state)).some((node) => typeof node.type === "function" && node.type.name === "AdminDialog")).toBe(false);
    expect(find(render(detail, state), (node) => node.type === "fieldset").props.disabled).toBe(false);
    expect(harness.rotatePin).toHaveBeenCalledOnce();
  });

  it.each(["success", "failure"] as const)("cleans up a removed employee detail and ignores a late PIN %s", async (outcome) => {
    const pending = deferred<{ employeeId: string; pin: string; sessionRevoked: boolean }>();
    const release = vi.fn();
    harness.begin.mockReturnValue(release);
    harness.rotatePin.mockReturnValue(pending.promise);
    const onReload = vi.fn();
    const { state, unmount } = pinDetail(onReload);
    unmount();
    expect(release).toHaveBeenCalled();
    const visibleStateAtUnmount = [state.values[6], state.values[7], state.values[10]];
    if (outcome === "success") pending.resolve({ employeeId: "EMP-TEST", pin: "638527", sessionRevoked: true });
    else pending.reject(new Error("late failure"));
    await flush();
    expect([state.values[6], state.values[7], state.values[10]]).toEqual(visibleStateAtUnmount);
    expect(onReload).not.toHaveBeenCalled();
    expect(harness.showToast).not.toHaveBeenCalled();
  });
});
