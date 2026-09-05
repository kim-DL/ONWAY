import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GlassButton } from "@/components/ui/glass-button";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("global stylesheet cleanup boundaries", () => {
  it("does not ship the retired, unmatchable sales palette", () => {
    expect(css).not.toMatch(/@media\s+not\s+all\s*\{/);
    expect(css).not.toContain("--sales-plum");
  });

  it("keeps the removed screen and guidance selectors out of the shared stylesheet", () => {
    const retiredClasses = [
      "login-card__step", "session-hero", "login-card__description", "logout-button",
      "session-shell", "session-header", "session-ticket", "employee-avatar",
      "assignment-card__header-meta", "assignment-card__route-order", "sales-route-error",
      "sales-claim-policy", "sales-task-row__icon", "sales-task-row__school",
      "shell-section-heading", "shell-section-heading--filters", "chip-row",
      "shell-empty-state", "shell-empty-state__icon", "sales-summary", "sales-zone-chips",
      "assignment-card__header", "assignment-card__zone", "assignment-card__school",
      "assignment-card__owner", "assignment-card__avatar", "assignment-card__signals",
      "assignment-card__footer", "sales-cycle-error", "activity-layout", "activity-calendar",
      "activity-calendar__icon", "activity-timeline", "activity-timeline__line", "detail-grid",
      "detail-work-card", "detail-card-heading__icon", "detail-placeholder", "detail-photo-summary",
      "photo-slot-list", "school-photo-gallery__policy", "visit-sample-name", "visit-form-save-error",
      "communication-editor__note", "school-scope-actions", "admin-login-help", "assignment-add",
      "sales-claim-zone", "delivery-recents__privacy", "sales-shared-brief", "sales-shared-brief__grid",
      "sales-contact-list",
    ];
    for (const name of retiredClasses) {
      expect(css).not.toMatch(new RegExp(`\\.${name}(?![\\w-])`));
    }
  });

  it("preserves styles for runtime-generated semantic variants, not only literal class names", () => {
    const variants = [
      ...(["primary", "quiet", "danger"] as const).map((variant) =>
        [renderToStaticMarkup(createElement(GlassButton, { variant })), `glass-button--${variant}`]),
      ...(["accent", "muted"] as const).map((tone) =>
        [renderToStaticMarkup(createElement(SoftCard, { tone })), `soft-card--${tone}`]),
      ...(["success", "attention", "info"] as const).map((tone) =>
        [renderToStaticMarkup(createElement(StatusBadge, { tone })), `status-badge--${tone}`]),
    ];
    for (const [markup, name] of variants) {
      expect(markup).toContain(name);
      expect(css).toContain(`.${name} {`);
    }
  });

  it("retains shared keyboard, reduced-motion, and high-contrast states", () => {
    expect(css).toContain(":is(.glass-button, .smart-chip):focus-visible");
    expect(css).toContain("outline-offset: 3px");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("outline-color: Highlight");
    expect(css).toContain(".bottom-sheet-layer > .bottom-sheet { animation: none; }");
  });

  it("keeps a source-size budget so retired design blocks do not silently return", () => {
    // The audited baseline was 335,305 bytes. This is a source-maintenance guard;
    // the production performance gate measures the actual shipped CSS separately.
    expect(Buffer.byteLength(css)).toBeLessThan(300_000);
  });
});
