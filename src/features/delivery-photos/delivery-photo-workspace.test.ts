import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { customerSchema, getCustomerChoseong, normalizeCustomerName, type Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { DeliveryPhotoRow, DeliveryPhotoWorkspace } from "./delivery-photo-workspace";

const session: AuthenticatedSession = {
  uid: "uid_1",
  displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] },
};

const customer: Customer = customerSchema.parse({
  customerId: "customer_1", companyId: "onnuri", name: "농진", normalizedName: normalizeCustomerName("농진"), choseongName: getCustomerChoseong("농진"),
  district: "서구", administrativeDong: "탄방동", officialAddress: "", deliveryAddress: "", deliveryPoint: null,
  accessPassword: "00123*", accessPasswordState: "registered", deliveryLocationDescription: "", contacts: [], status: "active",
  noticeType: "none", changeNote: "", revision: 1, createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z",
  createdBy: "EMP-ADMIN", updatedBy: "EMP-ADMIN",
});

describe("delivery photo field workspace", () => {
  it("renders a non-blocking loading shell with stable native camera and album inputs", () => {
    const html = renderToStaticMarkup(createElement(DeliveryPhotoWorkspace, { session }));
    expect(html).toContain("납품사진");
    expect(html).toContain("불러오는 중");
    expect(html).toContain('aria-label="납품사진 거래처 검색"');
    expect(html).toContain('aria-label="납품사진 카메라 촬영"');
    expect(html).toContain('capture="environment"');
    expect(html).toContain('aria-label="납품사진 앨범 선택"');
    expect(html.match(/type="file"/gu)).toHaveLength(2);
  });

  it("keeps narrow-screen containers shrinkable and touch controls at least 44px", () => {
    const css = readFileSync(fileURLToPath(new URL("./delivery-photo.module.css", import.meta.url)), "utf8");
    expect(css).toMatch(/\.workspace\s*\{[^}]*min-width:\s*0/u);
    expect(css).toMatch(/\.list\s*\{[^}]*min-width:0/u);
    expect(css).toContain("min-height:44px");
    expect(css).toContain("@media(max-width:380px)");
    expect(css).toContain(":focus-visible");
  });

  it.each([
    { value: customer, expected: "탄방동 · 출입비번 00123*" },
    { value: { ...customer, accessPassword: "", accessPasswordState: "none" as const }, expected: "탄방동" },
    { value: { ...customer, administrativeDong: "" }, expected: "출입비번 00123*" },
    { value: { ...customer, administrativeDong: "", accessPassword: "", accessPasswordState: "unknown" as const }, expected: "" },
  ])("formats existing customer location/password data without placeholders", ({ value, expected }) => {
    const html = renderToStaticMarkup(createElement(DeliveryPhotoRow, { customer: value, uploadReady: true,
      onView: () => undefined, onCapture: () => undefined, onMore: () => undefined, onRetry: () => undefined }));
    if (expected) expect(html).toContain(expected);
    else expect(html).not.toContain("<small");
  });

  it("makes the information area the sole history action and keeps camera and more separate", () => {
    const html = renderToStaticMarkup(createElement(DeliveryPhotoRow, { customer, count: 3, latestAt: "2026-09-24T01:42:00.000Z", uploadReady: true,
      onView: () => undefined, onCapture: () => undefined, onMore: () => undefined, onRetry: () => undefined }));
    expect(html).toContain("탄방동 · 출입비번 00123*");
    expect(html).toContain("사진 3장 · 마지막 등록 10:42");
    expect(html).toContain('aria-label="농진 사진 기록"');
    expect(html).toContain('aria-label="농진 카메라 촬영"');
    expect(html).toContain('aria-label="농진 더보기"');
    expect(html).not.toContain(">기록</button>");
  });

  it("exposes history before a customer has a photo today", () => {
    const html = renderToStaticMarkup(createElement(DeliveryPhotoRow, { customer, uploadReady: true,
      onView: () => undefined, onCapture: () => undefined, onMore: () => undefined, onRetry: () => undefined }));
    expect(html).toContain('aria-label="농진 사진 기록"');
    expect(html).toContain('aria-label="농진 카메라 촬영"');
  });

  it("does not add a persistent business-state or background queue dependency", () => {
    const files = ["delivery-photo-workspace.tsx", "delivery-photo-domain.ts", "delivery-photo-upload-state.ts", "delivery-photo-memory.ts",
      "delivery-photo-upload-memory.ts", "delivery-photo-input-controller.tsx", "delivery-photo-preparation.ts", "use-delivery-photo-data.ts",
      "delivery-photo-history.tsx", "delivery-photo-thumbnail.tsx", "delivery-photo-viewer.tsx", "use-delivery-photo-image.ts"];
    const source = files.map((file) => readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8")).join("\n");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|serviceWorker|CacheStorage|BackgroundSync/u);
  });
});
