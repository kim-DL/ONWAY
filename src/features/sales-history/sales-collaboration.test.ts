import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SalesAssignment, SalesProfile } from "@/domain/sales";
import type { UpdateSalesProfileResult } from "./sales-history-contract";

const harness = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, updateProfile: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = typeof initial === "function" ? initial() : initial;
    return [harness.values[index], (next: unknown) => {
      harness.values[index] = typeof next === "function" ? next(harness.values[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = { current: initial };
    return harness.values[index];
  },
  useMemo: (compute: () => unknown) => compute(),
}));
vi.mock("./sales-history-repository", () => ({ salesHistoryRepository: { updateProfile: harness.updateProfile } }));
vi.mock("@/components/ui/bottom-sheet", () => ({ BottomSheet: () => null, BottomSheetActions: () => null }));

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { SmartChip } from "@/components/ui/smart-chip";
import { SalesCollaboration } from "./sales-collaboration";

type Element = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
function find(node: ReactNode, predicate: (element: Element) => boolean) {
  const result = all(node).find(predicate);
  if (!result) throw new Error("Expected collaboration control is missing");
  return result;
}
function click(element: Element) { return (element.props.onClick as () => void)(); }
function button(node: ReactNode, label: string) {
  return find(node, (element) => element.type === "button" && element.props.children === label);
}
function chip(node: ReactNode, label: string) {
  return find(node, (element) => element.type === SmartChip && (element.props.children as ReactNode[]).includes(label));
}
const updated = vi.fn();
function render(canEdit = true) {
  harness.cursor = 0;
  return SalesCollaboration({
    schoolId: "SCH-TEST", assignment: { cycleId: "2026-08", revision: 1 } as SalesAssignment,
    profile: { communicationTagIds: ["COMM-CALL"] } as SalesProfile,
    currentSalesRevision: 1, currentNextAction: null, communicationTags: [], canEdit, onUpdated: updated,
  });
}
function openDraft() {
  click(find(render(), (element) => element.type === "button"));
  click(chip(render(), "문자 연락 선호"));
  return render();
}
function deferred() {
  let resolve!: (value: UpdateSalesProfileResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<UpdateSalesProfileResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

beforeEach(() => {
  harness.values = [];
  harness.cursor = 0;
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("communication tag save lifecycle", () => {
  it("locks tags and dismissals, rejects queued edits and duplicate saves, and publishes only the submitted selection", async () => {
    const pending = deferred();
    harness.updateProfile.mockReturnValue(pending.promise);
    const draft = openDraft();
    const save = button(draft, "업무 참고 저장");
    click(save);
    click(save);
    click(chip(draft, "문자 연락 선호"));
    click(button(draft, "취소"));
    expect(harness.updateProfile).toHaveBeenCalledTimes(1);
    expect(harness.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ communicationTagIds: ["COMM-CALL", "COMM-TEXT"] }));
    const saving = render();
    expect(find(saving, (element) => element.type === "fieldset").props.disabled).toBe(true);
    expect(chip(saving, "문자 연락 선호").props.selected).toBe(true);
    expect(chip(saving, "문자 연락 선호").props.disabled).toBe(true);
    expect(find(saving, (element) => element.type === BottomSheet).props.open).toBe(true);
    expect(find(saving, (element) => element.type === BottomSheetActions).props.busy).toBe(true);
    (find(saving, (element) => element.type === BottomSheet).props.onClose as () => void)();
    expect(find(render(), (element) => element.type === BottomSheet).props.open).toBe(true);

    const result = { communicationTagIds: ["COMM-CALL", "COMM-TEXT"], salesRevision: 2, replayed: false };
    pending.resolve(result);
    await flush();
    expect(updated).toHaveBeenCalledExactlyOnceWith(result);
    expect(find(render(), (element) => element.type === BottomSheet).props.open).toBe(false);
    expect(all(render()).filter((element) => element.type === "em").map((element) => element.props.children)).toEqual(["전화 연락 선호", "문자 연락 선호"]);
  });

  it("keeps failed selections and retry guidance in the fixed footer, reusing the request ID for an unchanged retry", async () => {
    const pending = deferred();
    harness.updateProfile.mockReturnValue(pending.promise);
    click(button(openDraft(), "업무 참고 저장"));
    pending.reject(new Error("connection failed"));
    await flush();
    const failed = render();
    const footer = find(failed, (element) => element.type === BottomSheetActions);
    expect(find(footer, (element) => element.props.role === "alert").props.children).toContain("다시 시도");
    expect(footer.props.busy).toBe(false);
    expect(find(failed, (element) => element.type === "fieldset").props.disabled).toBe(false);
    expect(chip(failed, "문자 연락 선호").props.selected).toBe(true);
    expect(find(failed, (element) => element.type === BottomSheet).props.open).toBe(true);
    const retry = deferred();
    harness.updateProfile.mockReturnValue(retry.promise);
    click(button(failed, "업무 참고 저장"));
    expect(harness.updateProfile.mock.calls[1]![0]).toEqual(harness.updateProfile.mock.calls[0]![0]);
    retry.resolve({ communicationTagIds: ["COMM-CALL", "COMM-TEXT"], salesRevision: 2, replayed: false });
    await flush();
  });

  it("never sends a mutation from a read-only context", () => {
    click(button(render(false), "업무 참고 저장"));
    click(chip(render(false), "문자 연락 선호"));
    expect(harness.updateProfile).not.toHaveBeenCalled();
    expect(chip(render(false), "문자 연락 선호").props.selected).toBe(false);
  });
});
