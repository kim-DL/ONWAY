import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateIndex: 0,
  refIndex: 0,
  mounted: false,
}));

// Exercise the actual picker handlers and rendered props without adding a DOM
// renderer. Child components are not invoked; browser focus/portals are covered
// by phase22-action-reach.spec.ts.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.state)) hooks.state[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.state[index], (next: unknown) => {
      hooks.state[index] = typeof next === "function" ? next(hooks.state[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.refIndex++;
    return hooks.refs[index] ??= { current: initial };
  },
  useEffect: (effect: () => unknown) => { if (!hooks.mounted) effect(); },
  useMemo: (compute: () => unknown) => compute(),
  useDeferredValue: (value: unknown) => value,
}));

import { SchoolAssignmentPicker } from "./school-assignment-picker";

type ElementProps = {
  children?: ReactNode;
  role?: string;
  type?: string;
  variant?: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: () => void;
  onClick?: () => void;
};
type PickerProps = Parameters<typeof SchoolAssignmentPicker>[0];

const candidates = ["A", "B"].map((schoolId) => ({
  schoolId, name: `${schoolId}초등학교`, district: "seo", schoolType: "elementary", address: null,
}));
const detailedError = "선택한 학교 중 일부를 다른 직원이 먼저 가져갔습니다. 최신 목록으로 다시 확인해주세요.";

function elements(value: ReactNode): Array<ReactElement<ElementProps>> {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<ElementProps>(value)) return [];
  return [value, ...elements(value.props.children)];
}

function render(props: PickerProps) {
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  const tree = elements(SchoolAssignmentPicker(props));
  hooks.mounted = true;
  return {
    alert: tree.find((node) => node.props.role === "alert")?.props.children,
    checkboxes: tree.filter((node) => node.type === "input" && node.props.type === "checkbox"),
    commit: tree.find((node) => node.props.variant === "primary")!,
  };
}

function propsFor(onSubmit: PickerProps["onSubmit"], submitErrorMessage?: string | null): PickerProps {
  return {
    candidates, busy: false, actionLabel: (count) => `${count}곳 가져오기`, onSubmit,
    ...(submitErrorMessage !== undefined ? { submitErrorMessage } : {}),
  };
}

async function settleSubmit() {
  // The click intentionally returns void; advance its awaited submit callback.
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  hooks.state = [];
  hooks.refs = [];
  hooks.mounted = false;
});

describe("assignment picker error recovery", () => {
  it("shows the actionable reason inside the picker and retains the failed selection", async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    const props = propsFor(onSubmit, detailedError);
    render(props).checkboxes[0]!.props.onChange!();
    render(props).commit.props.onClick!();
    await settleSubmit();

    const failed = render(props);
    expect(failed.alert).toBe(detailedError);
    expect(failed.checkboxes[0]!.props.checked).toBe(true);
    expect(failed.commit.props.disabled).toBe(false);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(["A"]);
  });

  it("clears the visible error when selection changes even while the parent retains its last reason", async () => {
    const props = propsFor(vi.fn().mockResolvedValue(false), detailedError);
    render(props).checkboxes[0]!.props.onChange!();
    render(props).commit.props.onClick!();
    await settleSubmit();
    expect(render(props).alert).toBe(detailedError);

    render(props).checkboxes[1]!.props.onChange!();
    expect(render(props).alert).toBeUndefined();
    expect(render(props).checkboxes.map((node) => node.props.checked)).toEqual([true, true]);
  });

  it("hides the old reason immediately on retry and displays the new failure without losing selection", async () => {
    let completeRetry!: (completed: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { completeRetry = resolve; });
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockReturnValueOnce(pending);
    const props = propsFor(onSubmit, detailedError);
    render(props).checkboxes[0]!.props.onChange!();
    render(props).commit.props.onClick!();
    await settleSubmit();
    expect(render(props).alert).toBe(detailedError);

    render(props).commit.props.onClick!();
    expect(render(props).alert).toBeUndefined();
    expect(render(props).commit.props.disabled).toBe(true);
    completeRetry(false);
    await settleSubmit();
    const retried = render({ ...props, submitErrorMessage: "담당 학교를 변경할 권한이 없습니다." });
    expect(retried.alert).toBe("담당 학교를 변경할 권한이 없습니다.");
    expect(retried.checkboxes[0]!.props.checked).toBe(true);
  });

  it("does not show a stale external reason when opening a fresh picker", () => {
    const fresh = render(propsFor(vi.fn().mockResolvedValue(false), detailedError));
    expect(fresh.alert).toBeUndefined();
    expect(fresh.checkboxes.every((node) => !node.props.checked)).toBe(true);
  });

  it("keeps the boolean admin submit contract and generic fallback when no detail is supplied", async () => {
    const props = propsFor(vi.fn().mockResolvedValue(false));
    render(props).checkboxes[0]!.props.onChange!();
    render(props).commit.props.onClick!();
    await settleSubmit();
    expect(render(props).alert).toBe("처리를 완료하지 못했어요. 선택한 학교를 확인한 뒤 다시 시도해주세요.");
    expect(render(props).checkboxes[0]!.props.checked).toBe(true);
  });
});
