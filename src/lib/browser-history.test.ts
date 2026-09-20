import { describe, expect, it } from "vitest";
import { customHistoryState } from "./browser-history";

describe("app-owned native history state", () => {
  it("retains shell/dialog and unrelated custom state without replaying Next private markers", () => {
    const state = { __NA: true, _N: true, __N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "router-owned" }, onnuriwayShell: { mode: "inventory" }, onnuriwaySheet: "detail", custom: 7 };
    expect(customHistoryState(state)).toEqual({ onnuriwayShell: { mode: "inventory" }, onnuriwaySheet: "detail", custom: 7 });
    expect(state.__NA).toBe(true);
  });
  it("makes a fresh payload on every write, including after the router mutates a previous argument", () => {
    const stored = { onnuriwaySheet: "editor" };
    const first = customHistoryState(stored);
    Object.assign(first, { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} });
    expect(stored).toEqual({ onnuriwaySheet: "editor" });
    expect(customHistoryState(first)).toEqual(stored);
    expect(customHistoryState(stored)).not.toBe(stored);
  });
  it.each([null, undefined, true, 3, "legacy", []])("accepts an initial history value without custom state: %s", (state) => {
    expect(customHistoryState(state)).toEqual({});
  });
});
