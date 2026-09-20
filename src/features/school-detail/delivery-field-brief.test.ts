import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SchoolFieldProfile } from "@/domain/school";
import { DeliveryFieldBrief, SchoolLocationBrief, inspectionTimeLabel } from "./delivery-field-brief";

const profile = {
  inspection: { startTime: "08:00", endTime: "09:00", note: "도착 10분 전 연락" },
  cafeteria: { building: "본관", floor: "1층", locationDescription: "운동장 오른쪽", entranceDescription: "후문 출입", routeDescription: "후문에서 직진" },
  contacts: { dietitianPhone: "01012345678", cafeteriaPhone: "0421234567" },
  equipment: { cartRequired: "required", elevator: "available", stairsRequired: "required" },
  vehicle: { access: "limited", parking: "unavailable", unloadingLocation: "레거시 하역 위치", note: "레거시 차량 메모" },
  fieldNotes: "비 오는 날 출입문 앞 물기 주의",
} as SchoolFieldProfile;

function render(overrides: Partial<SchoolFieldProfile> = {}, canEdit = true) {
  return renderToStaticMarkup(createElement(DeliveryFieldBrief, {
    profile: { ...profile, ...overrides }, schoolPhone: "0425556666", canEdit, onEdit: () => undefined,
  }));
}

describe("delivery field brief", () => {
  it.each([
    ["08:00", "09:00", "08:00 – 09:00"],
    ["08:00", null, "08:00부터"],
    [null, "09:00", "09:00까지"],
    [null, null, "시간 미등록"],
  ])("distinguishes partial inspection bounds (%s, %s)", (startTime, endTime, expected) => {
    expect(inspectionTimeLabel({ startTime, endTime, note: null })).toBe(expected);
  });

  it("renders useful information once inside a single card, with callable numbers", () => {
    const html = render();
    expect(html.match(/data-delivery-brief/g)).toHaveLength(1);
    for (const value of ["납품 현장정보", "08:00 – 09:00", "본관 · 1층", "운동장 오른쪽", "후문 출입", "후문에서 직진", "비 오는 날 출입문 앞 물기 주의"]) {
      expect(html.split(value)).toHaveLength(2);
    }
    expect(html).toContain('href="tel:01012345678"');
    expect(html).toContain('href="tel:0421234567"');
    expect(html).toContain('href="tel:0425556666"');
    expect(html).toContain("010-1234-5678");
    expect(html).toContain("042-123-4567");
    for (const retired of ["차량", "하역", "계단", "01 ·", "02 ·", "03 ·", "04 ·", "FIELD BRIEF"]) expect(html).not.toContain(retired);
  });

  it("does not suggest unknown information is confirmed or expose edit controls to readers", () => {
    const html = render({
      inspection: { startTime: null, endTime: null, note: null },
      cafeteria: { building: null, floor: null, locationDescription: null, entranceDescription: null, routeDescription: null },
      equipment: { cartRequired: "unknown", elevator: "unknown", stairsRequired: "unknown" },
      fieldNotes: null,
    }, false);
    expect(html).toContain("시간 미등록");
    expect(html).toContain("위치 미등록");
    expect(html.match(/미확인/g)).toHaveLength(2);
    expect(html).not.toContain("현장 준비 완료");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("현장 참고");
  });
});

describe("sales school location brief", () => {
  it.each(["available", "unavailable", "unknown"] as const)("shows the shared location and truthful elevator status: %s", (elevator) => {
    const html = renderToStaticMarkup(createElement(SchoolLocationBrief, {
      profile: { ...profile, equipment: { ...profile.equipment, elevator } }, canEdit: true, onEdit: () => undefined,
    }));
    for (const value of ["본관 · 1층", "운동장 오른쪽", "후문 출입", "후문에서 직진"]) expect(html.split(value)).toHaveLength(2);
    expect(html).toContain(({ available: "있음", unavailable: "없음", unknown: "미확인" })[elevator]);
    expect(html).toContain("위치 수정");
    for (const excluded of ["검수시간", "대차", "계단", "차량", "하역", "도착 10분 전 연락"]) expect(html).not.toContain(excluded);
  });

  it("renders unregistered location without assuming a first floor or no elevator", () => {
    const html = renderToStaticMarkup(createElement(SchoolLocationBrief, { profile: null, canEdit: false, onEdit: () => undefined }));
    expect(html).toContain("위치 미등록");
    expect(html).toContain("미확인");
    expect(html).not.toContain("1층");
    expect(html).not.toContain("없음");
    expect(html).not.toContain("<button");
  });

  it("preserves multiline location notes without repeating a location-only description", () => {
    const html = renderToStaticMarkup(createElement(SchoolLocationBrief, {
      profile: { ...profile, cafeteria: { ...profile.cafeteria, building: null, floor: null, locationDescription: "정문 오른쪽\n파란 출입구" } }, canEdit: false, onEdit: () => undefined,
    }));
    expect(html.split("정문 오른쪽\n파란 출입구")).toHaveLength(2);
  });
});
