import { describe, expect, it } from "vitest";

import { rememberWorkspaceScroll, restoreWorkspaceScroll } from "./workspace-scroll-memory";

describe("workspace scroll memory", () => {
  it("restores a valid position after the list is rendered", () => {
    const scroller = { clientHeight: 600, scrollHeight: 2_000, scrollTop: 0 };
    restoreWorkspaceScroll(scroller, 720);
    expect(scroller.scrollTop).toBe(720);
  });

  it("clamps a saved position when the refreshed list is shorter", () => {
    const scroller = { clientHeight: 600, scrollHeight: 900, scrollTop: 0 };
    restoreWorkspaceScroll(scroller, 1_400);
    expect(scroller.scrollTop).toBe(300);
  });

  it("records scroll events and cleans up without a layout read after the DOM changes", () => {
    const target = new EventTarget();
    let top = 0;
    let layoutInvalid = false;
    const saved: number[] = [];
    const scroller = {
      clientHeight: 600, scrollHeight: 6_000,
      get scrollTop() { if (layoutInvalid) throw new Error("Unexpected layout read during cleanup"); return top; },
      set scrollTop(value: number) { top = value; },
      addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target),
    };
    const cleanup = rememberWorkspaceScroll(scroller, 900, (value) => saved.push(value));
    expect(top).toBe(900);
    top = 1_420; target.dispatchEvent(new Event("scroll"));
    expect(saved).toEqual([1_420]);
    layoutInvalid = true;
    cleanup();
    expect(saved).toEqual([1_420]);
    target.dispatchEvent(new Event("scroll"));
    expect(saved).toHaveLength(1);
  });
});
