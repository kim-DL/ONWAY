import { describe, expect, it } from "vitest";

import { restoreWorkspaceScroll } from "./workspace-scroll-memory";

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
});
