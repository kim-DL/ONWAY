import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ADMIN_NAVIGATION, AdminNavigation } from "./admin-navigation";

describe("administrator navigation contract", () => {
  it("keeps administrator styles scoped while preserving the account avatar and shared brand styles", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const workspaceCss = readFileSync(new URL("./admin-workspace.module.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/\.admin-(?:sidebar|brand|main|content|topbar|page|metric|table|session-card)(?:\b|__)/);
    expect(workspaceCss).toContain(".workspace :global(.admin-main)");
    expect(workspaceCss).toContain(".workspace :global(.admin-content)");
    const avatar = workspaceCss.match(/\.workspace\s+:global\(\.admin-session-card__avatar\)\s*\{([^}]*)\}/)?.[1];
    expect(avatar).toContain("width: 36px");
    expect(avatar).toContain("height: 36px");
    expect(avatar).toContain("font-weight: 750");
    expect(css).toMatch(/\.auth-brand__mark\s*\{\s*position: relative;\s*isolation: isolate;/);
    expect(css).toContain(".auth-brand__mark::after { animation: brand-mark-sheen");
    expect(css).toContain(".auth-brand > span:last-child { animation: brand-copy-arrive");
  });

  it("keeps all nine destinations and partitions four quick destinations from five additional tools", () => {
    expect(ADMIN_NAVIGATION.map((item) => item.id)).toEqual([
      "overview", "customers", "schools", "employees", "cycles", "sync", "export", "audit", "settings",
    ]);
    expect(new Set(ADMIN_NAVIGATION.map((item) => item.id)).size).toBe(9);
    expect(ADMIN_NAVIGATION.filter((item) => item.mobileLabel).map((item) => item.id))
      .toEqual(["overview", "customers", "schools", "employees"]);
    expect(ADMIN_NAVIGATION.filter((item) => !item.mobileLabel)).toHaveLength(5);
  });

  it("groups desktop destinations by purpose without repeating their supporting hints visually", () => {
    const html = renderToStaticMarkup(createElement(AdminNavigation, { view: "overview", onNavigate: () => undefined, displayName: "관리자" }));
    const sidebar = html.match(/<nav aria-label="관리자 주요 메뉴">([\s\S]*?)<\/nav>/)?.[1] ?? "";
    expect([...sidebar.matchAll(/role="group" aria-label="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(["업무 관리", "팀 관리", "운영 도구"]);
    expect(ADMIN_NAVIGATION.filter((item) => item.group === "work").map((item) => item.id))
      .toEqual(["overview", "customers", "schools"]);
    expect(ADMIN_NAVIGATION.filter((item) => item.group === "team").map((item) => item.id))
      .toEqual(["employees", "cycles"]);
    expect(ADMIN_NAVIGATION.filter((item) => item.group === "tools").map((item) => item.id))
      .toEqual(["sync", "export", "audit", "settings"]);
    expect(sidebar.match(/<button\b/g)).toHaveLength(9);
    expect(sidebar).not.toContain("<small");
    for (const item of ADMIN_NAVIGATION) {
      expect(sidebar).toContain(`aria-label="${item.label} · ${item.hint}"`);
      expect(sidebar).toContain(`>${item.label}</strong>`);
    }
  });

  it("announces the selected secondary destination and a closed More dialog trigger", () => {
    const html = renderToStaticMarkup(createElement(AdminNavigation, { view: "settings", onNavigate: () => undefined, displayName: "관리자" }));
    expect(html).toContain('aria-label="설정 · 앱 운영 정책"');
    expect(html).toMatch(/aria-label="더보기"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*aria-current="page"/);
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descriptionId).toBeTruthy();
    expect(html).toContain(`id="${descriptionId}">설정 선택됨</span>`);
    expect(html).not.toContain("admin-sidebar");
    expect(html).not.toContain('<dialog');
  });

  it("keeps sync review discoverable without changing a primary destination's selection", () => {
    const html = renderToStaticMarkup(createElement(AdminNavigation, { view: "customers", onNavigate: () => undefined, displayName: "관리자", needsSyncReview: true }));
    expect(html.match(/aria-label="검토 필요"/g)).toHaveLength(2);
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-label="더보기"[^>]*aria-expanded="false"[^>]*>/);
    expect(html).not.toContain("aria-describedby=");
  });
});
