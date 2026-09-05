import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { SalesClaimPicker } from "./sales-claim-picker";

const { useCatalog, picker } = vi.hoisted(() => ({ useCatalog: vi.fn(), picker: vi.fn() }));
vi.mock("@/features/search/use-school-search-catalog", () => ({ useSchoolSearchCatalog: useCatalog }));
vi.mock("@/components/assignment/school-assignment-picker", () => ({
  SchoolAssignmentPicker: picker,
}));

const session = { uid: "test-session" } as AuthenticatedSession;
const props = {
  session,
  assignedSchoolIds: new Set(["assigned"]),
  busy: false,
  submitErrorMessage: null,
  onSubmit: vi.fn(async () => true),
};

beforeEach(() => {
  vi.clearAllMocks();
  picker.mockReturnValue(null);
});

describe("deferred sales claim picker", () => {
  it("preserves accessible catalog loading and does not render selection controls prematurely", () => {
    useCatalog.mockReturnValue({ status: "loading" });
    const html = renderToStaticMarkup(createElement(SalesClaimPicker, props));
    expect(html).toContain('role="status"');
    expect(html).toContain("전체 학교 목록을 준비하고 있어요.");
    expect(picker).not.toHaveBeenCalled();
    expect(useCatalog).toHaveBeenCalledWith(session, "sales");
  });

  it("preserves a recoverable catalog error", () => {
    useCatalog.mockReturnValue({ status: "error", retry: vi.fn() });
    const html = renderToStaticMarkup(createElement(SalesClaimPicker, props));
    expect(html).toContain('role="alert"');
    expect(html).toContain("다시 불러오기");
    expect(picker).not.toHaveBeenCalled();
  });

  it("preserves active-unassigned filtering and submit state across the lazy boundary", () => {
    const candidate = {
      schoolId: "available", name: "선택초등학교", district: "seo", schoolType: "elementary",
      addressSummary: "대전광역시 서구", operationalStatus: "active",
    };
    useCatalog.mockReturnValue({ status: "ready", catalog: { items: [
      candidate,
      { ...candidate, schoolId: "assigned" },
      { ...candidate, schoolId: "closed", operationalStatus: "closed" },
    ] } });
    renderToStaticMarkup(createElement(SalesClaimPicker, {
      ...props, busy: true, submitErrorMessage: "선택한 학교를 다시 확인해주세요.",
    }));
    const forwarded = picker.mock.calls[0]![0];
    expect(forwarded.candidates).toEqual([{
      schoolId: "available", name: "선택초등학교", district: "seo", schoolType: "elementary",
      address: "대전광역시 서구",
    }]);
    expect(forwarded.busy).toBe(true);
    expect(forwarded.submitErrorMessage).toBe("선택한 학교를 다시 확인해주세요.");
    expect(forwarded.onSubmit).toBe(props.onSubmit);
    expect(forwarded.actionLabel(3)).toBe("3곳 내 담당으로 가져오기");
  });

  it("keeps both optional tools out of static workspace imports and inside their existing sheets", () => {
    const source = readFileSync(new URL("./sales-workspace.tsx", import.meta.url), "utf8");
    expect(source).toContain('() => import("./sales-claim-picker")');
    expect(source).toContain('() => import("@/features/sales-route/sales-route-planner")');
    expect(source).not.toMatch(/^import .*from ["'][^"']*(?:school-assignment-picker|use-school-search-catalog|sales-route-planner)["']/m);
    expect(source).toMatch(/claimSheetOpen \? \(\s*<SalesClaimPicker/);
    expect(source).toMatch(/routeSheetOpen \? \(\s*<SalesRoutePlanner/);
  });
});
