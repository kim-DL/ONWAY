import { afterEach, describe, expect, it, vi } from "vitest";

import type { School } from "@/domain/school";
import type { SalesAssignment } from "@/domain/sales";
import {
  assignmentReleaseRestrictionMessage,
  deliveryStatusLabel,
  formatCardVisitDate,
  schoolLocationSummary,
  shouldShowDeliveryStatus,
} from "./sales-school-card-presentation";

function schoolAddress(
  road: string | null,
  jibun: string | null = null,
  district: School["district"] = "seo",
): Pick<School, "district" | "address"> {
  return { district, address: { road, jibun, postalCode: null } };
}

afterEach(() => vi.unstubAllEnvs());

describe("compact card delivery labels", () => {
  it.each([
    ["delivered", "전달"],
    ["notDelivered", "미전달"],
    ["unknown", "미확인"],
  ] as const)("renders %s as %s without merging recorded and unknown states", (status, expected) => {
    expect(deliveryStatusLabel(status)).toBe(expected);
  });
});

const untouchedAssignment: Pick<SalesAssignment,
  "monthlyStatus" | "latestVisitId" | "latestVisitedAt" | "brochureStatus" | "sampleStatus" | "assigneeIds"> = {
  monthlyStatus: "before", latestVisitId: null, latestVisitedAt: null,
  brochureStatus: "unknown", sampleStatus: "unknown", assigneeIds: ["EMP-TEST"],
};

describe("compact card delivery visibility", () => {
  it("hides unknown placeholders only for an untouched before-visit assignment", () => {
    expect(shouldShowDeliveryStatus(untouchedAssignment, "unknown")).toBe(false);
  });

  it.each(["delivered", "notDelivered"] as const)("always preserves a recorded %s state", (status) => {
    expect(shouldShowDeliveryStatus(untouchedAssignment, status)).toBe(true);
  });

  it.each(["completed", "followUp", "revisit", "onHold"] as const)("preserves unknown for monthly state %s", (monthlyStatus) => {
    expect(shouldShowDeliveryStatus({ ...untouchedAssignment, monthlyStatus }, "unknown")).toBe(true);
  });

  it.each([
    { latestVisitId: "VISIT-TEST", latestVisitedAt: new Date("2026-09-05T00:00:00Z") },
    { latestVisitId: "VISIT-TEST", latestVisitedAt: null },
    { latestVisitId: null, latestVisitedAt: new Date("2026-09-05T00:00:00Z") },
  ])("preserves unknown when either visit field indicates a record: %j", (record) => {
    expect(shouldShowDeliveryStatus({ ...untouchedAssignment, ...record }, "unknown")).toBe(true);
  });

  it("handles brochure and sample independently without inventing the other delivery state", () => {
    const assignment = { ...untouchedAssignment, brochureStatus: "delivered" as const };
    expect(shouldShowDeliveryStatus(assignment, assignment.brochureStatus)).toBe(true);
    expect(shouldShowDeliveryStatus(assignment, assignment.sampleStatus)).toBe(false);
  });
});

describe("compact card release restriction", () => {
  it("does not incorrectly claim an untouched joint assignment has a work record", () => {
    expect(assignmentReleaseRestrictionMessage({ ...untouchedAssignment, assigneeIds: ["EMP-TEST", "EMP-SECOND"] }))
      .toBe("공동 담당 학교는 관리자에게 변경 요청");
  });

  it("keeps the joint-assignment restriction explicit even when a visit is also recorded", () => {
    expect(assignmentReleaseRestrictionMessage({ ...untouchedAssignment, assigneeIds: ["EMP-TEST", "EMP-SECOND"], latestVisitId: "VISIT-TEST" }))
      .toBe("공동 담당 학교는 관리자에게 변경 요청");
  });

  it.each([
    { latestVisitId: "VISIT-TEST" },
    { latestVisitedAt: new Date("2026-09-05T00:00:00Z") },
    { monthlyStatus: "completed" as const },
    { brochureStatus: "delivered" as const },
    { sampleStatus: "notDelivered" as const },
  ])("uses the record restriction for a single-assignee recorded state: %j", (record) => {
    expect(assignmentReleaseRestrictionMessage({ ...untouchedAssignment, ...record }))
      .toBe("업무 기록이 있어 관리자에게 변경 요청");
  });

  it("does not invent a work record when another eligibility rule prevents release", () => {
    expect(assignmentReleaseRestrictionMessage(untouchedAssignment)).toBe("담당 변경은 관리자에게 요청");
  });
});

describe("compact school address", () => {
  it("prefers the road address and keeps the full road number and parentheses", () => {
    expect(schoolLocationSummary(schoolAddress(
      "대전광역시 서구 가수원로 26-3 (가수원동)",
      "대전광역시 서구 가수원동 123",
    ))).toBe("서구 가수원로 26-3 (가수원동)");
  });

  it.each([null, "", " \t\n "])("uses the lot address when the road address is %j", (road) => {
    expect(schoolLocationSummary(schoolAddress(road, "대전광역시 서구 가수원동 123-4")))
      .toBe("서구 가수원동 123-4");
  });

  it.each([
    [null, null],
    ["", ""],
    [" \t ", "\n "],
  ] as const)("labels missing road %j and lot %j as unregistered, without inventing an address", (road, jibun) => {
    expect(schoolLocationSummary(schoolAddress(road, jibun, "yuseong"))).toBe("유성구 · 주소 미등록");
  });

  it.each(["대전광역시", "대전시", "대전"])("removes only the leading %s city prefix", (prefix) => {
    expect(schoolLocationSummary(schoolAddress(`${prefix} 서구 둔산로 12`))).toBe("서구 둔산로 12");
  });

  it("trims and collapses whitespace while preserving address content", () => {
    expect(schoolLocationSummary(schoolAddress(" \t대전광역시  서구\n 둔산로\t12  (둔산동)  ")))
      .toBe("서구 둔산로 12 (둔산동)");
  });

  it("preserves a different city name instead of making it look like a Daejeon address", () => {
    expect(schoolLocationSummary(schoolAddress("세종특별자치시 한누리대로 12")))
      .toBe("서구 · 세종특별자치시 한누리대로 12");
  });

  it("does not remove Daejeon text inside a road name", () => {
    expect(schoolLocationSummary(schoolAddress("서구 대전로 12"))).toBe("서구 대전로 12");
  });

  it("adds the catalog district only when the complete district token is absent", () => {
    expect(schoolLocationSummary(schoolAddress("둔산로 12"))).toBe("서구 · 둔산로 12");
    expect(schoolLocationSummary(schoolAddress("서구로 12"))).toBe("서구 · 서구로 12");
  });

  it.each([
    ["dong", "동구"], ["jung", "중구"], ["seo", "서구"],
    ["yuseong", "유성구"], ["daedeok", "대덕구"],
  ] as const)("does not duplicate an existing %s district token", (district, label) => {
    expect(schoolLocationSummary(schoolAddress(`대전광역시 ${label} 학교로 12`, null, district)))
      .toBe(`${label} 학교로 12`);
  });
});

describe("compact latest-visit date", () => {
  it.each([
    ["2026-09-04T14:59:59.999Z", "9월 4일"],
    ["2026-09-04T15:00:00.000Z", "9월 5일"],
    ["2026-12-31T15:00:00.000Z", "1월 1일"],
  ] as const)("formats %s by the Seoul calendar boundary", (input, expected) => {
    expect(formatCardVisitDate(new Date(input))).toBe(expected);
  });

  it.each(["UTC", "America/Los_Angeles"])("does not change the displayed day in host timezone %s", (timeZone) => {
    vi.stubEnv("TZ", timeZone);
    expect(formatCardVisitDate(new Date("2026-09-04T15:00:00.000Z"))).toBe("9월 5일");
  });

  it("returns null for an unrecorded visit", () => {
    expect(formatCardVisitDate(null)).toBeNull();
  });

  it("returns null instead of throwing for an invalid date", () => {
    expect(formatCardVisitDate(new Date("not-a-date"))).toBeNull();
  });
});
