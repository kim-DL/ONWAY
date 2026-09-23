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

  it("does not add a persistent business-state or background queue dependency", () => {
    const files = ["delivery-photo-workspace.tsx", "delivery-photo-domain.ts", "delivery-photo-upload-state.ts", "delivery-photo-memory.ts",
      "delivery-photo-upload-memory.ts", "delivery-photo-input-controller.tsx", "delivery-photo-preparation.ts", "use-delivery-photo-data.ts"];
    const source = files.map((file) => readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8")).join("\n");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|serviceWorker|CacheStorage|BackgroundSync/u);
  });
});
