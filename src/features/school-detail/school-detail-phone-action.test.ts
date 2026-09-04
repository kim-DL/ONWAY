import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, ready: true, phone: null as string | null }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (next: unknown) => { harness.values[index] = next; }];
  },
  useCallback: (callback: unknown) => callback,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/bottom-sheet", () => ({ BottomSheet: () => null, BottomSheetActions: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./school-detail-repository", () => ({ schoolDetailRepository: {} }));
vi.mock("./use-school-detail", () => ({
  useSchoolDetail: (school: School) => ({
    status: harness.ready ? "ready" : "loading", refresh: vi.fn(), refreshing: false, stale: false,
    detail: harness.ready ? { school: { ...school, phone: harness.phone }, fieldProfile: null, salesData: null, photos: [] } : null,
  }),
}));

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SchoolDetail } from "./school-detail";

type Element = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
function text(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : "";
}
function phoneButton(node: ReactNode, label: string) {
  const button = all(node).find((element) => element.type === "button" && text(element) === label);
  if (!button) throw new Error("Expected contextual phone button is missing");
  return button;
}
function render(role: "sales" | "viewer" = "sales") {
  harness.cursor = 0;
  return SchoolDetail({
    school: {
      schoolId: "SCH-PHONE", name: "연락처 테스트 학교", phone: null, district: "seo", schoolType: "elementary",
      address: { road: "대전 서구", jibun: null }, location: { matchStatus: "unmatched" },
    } as School,
    session: { claims: { roleScopes: [role], employeeId: "EMP-PHONE" } } as AuthenticatedSession,
    mode: "sales",
  });
}

beforeEach(() => { harness.values = []; harness.cursor = 0; harness.ready = true; harness.phone = null; });

describe("school contextual phone action", () => {
  it("opens the contact form directly for an editable school without a telephone number", () => {
    const button = phoneButton(render(), "전화 등록");
    expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)();
    const sheet = all(render()).find((element) => element.type === BottomSheet)!;
    expect(sheet.props.open).toBe(true);
    expect(sheet.props.title).toBe("학교 연락처 수정");
  });

  it.each(["viewer", "loading"] as const)("does not open an editor in a %s state, even from a queued callback", (state) => {
    harness.ready = state !== "loading";
    const role = state === "viewer" ? "viewer" : "sales";
    const button = phoneButton(render(role), state === "viewer" ? "연락처 없음" : "전화 등록");
    expect(button.props.disabled).toBe(true);
    (button.props.onClick as () => void)();
    expect(all(render(role)).find((element) => element.type === BottomSheet)!.props.open).toBe(false);
  });

  it("preserves the telephone link when an existing school number is available", () => {
    harness.phone = "042-123-4567";
    const phoneLink = all(render()).find((element) => element.type === "a" && text(element) === "전화");
    expect(phoneLink?.props.href).toBe("tel:0421234567");
    expect(all(render()).some((element) => element.type === "button" && text(element) === "전화 등록")).toBe(false);
  });
});
