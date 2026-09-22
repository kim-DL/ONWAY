import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { DeliveryPhotoWorkspace } from "./delivery-photo-workspace";

const session: AuthenticatedSession = {
  uid: "uid_1",
  displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] },
};

describe("delivery photo workspace foundation", () => {
  it("renders the approved sections with native keyboard-operable controls", () => {
    const html = renderToStaticMarkup(createElement(DeliveryPhotoWorkspace, { session }));
    for (const heading of ["오늘 남은 납품처", "기록완료", "거래처 검색", "최근 거래처", "내 납품처"]) expect(html).toContain(heading);
    expect(html).toContain('data-upload-state="idle"');
    expect(html).toContain('aria-label="납품사진 거래처 검색"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("곧 제공");
  });

  it("keeps narrow-screen containers shrinkable and touch controls at least 44px", () => {
    const css = readFileSync(fileURLToPath(new URL("./delivery-photo.module.css", import.meta.url)), "utf8");
    expect(css).toMatch(/\.workspace\s*\{[^}]*min-width:\s*0/u);
    expect(css).toMatch(/\.grid\s*\{[^}]*min-width:\s*0/u);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 380px)");
  });

  it("does not add a persistent business-state or background queue dependency", () => {
    const files = ["delivery-photo-workspace.tsx", "delivery-photo-domain.ts", "delivery-photo-upload-state.ts"];
    const source = files.map((file) => readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8")).join("\n");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|serviceWorker|CacheStorage|BackgroundSync|\bFile\b|\bBlob\b/u);
  });
});
