import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceFeatureLoading } from "./workspace-feature-loading";

describe("workspace loading boundaries", () => {
  it.each(["customer", "inventory", "sales", "activity", "delivery", "detail"] as const)("keeps %s placeholders inert with one status announcement", (mode) => {
    const html = renderToStaticMarkup(createElement(WorkspaceFeatureLoading, { mode }));
    expect(html).toContain(`data-workspace-loading="${mode}"`);
    // Busy ancestors can suppress a live region until a flag is cleared. These
    // placeholders unmount at completion, so their single status must stay live.
    expect(html).not.toContain('aria-busy="true"');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<(?:button|input|nav)\b/);
    expect(html).not.toMatch(/aria-valuenow|data-loader-piece|data-quantum/);
    expect(html).toContain('data-visible="false"');
  });

  it("uses photo shapes only for photo-oriented content, without inventing a completed amount", () => {
    const inventory = renderToStaticMarkup(createElement(WorkspaceFeatureLoading, { mode: "inventory" }));
    const delivery = renderToStaticMarkup(createElement(WorkspaceFeatureLoading, { mode: "delivery" }));
    expect(inventory).not.toContain('data-loading-skeleton="photo"');
    expect(delivery).toContain('data-loading-skeleton="photo"');
    expect(delivery).not.toMatch(/\d+%/);
  });
});
