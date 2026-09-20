import { describe, expect, it, vi } from "vitest";
import { lockBodyScroll } from "./body-scroll-lock";

function body(overflow = "", priority = "") {
  const style = { overflow, getPropertyPriority: () => priority, setProperty: vi.fn((_key: string, value: string) => { style.overflow = value; }) };
  return { style } as unknown as HTMLElement;
}

describe("owned body scroll locks", () => {
  it.each(["parent-first", "child-first"])("restores the original overflow with %s cleanup", (order) => {
    const element = body("auto", "important");
    const parent = lockBodyScroll(element);
    const child = lockBodyScroll(element);
    const [first, last] = order === "parent-first" ? [parent, child] : [child, parent];
    expect(element.style.overflow).toBe("hidden");
    first!();
    expect(element.style.overflow).toBe("hidden");
    last!();
    expect(element.style.overflow).toBe("auto");
    expect(element.style.setProperty).toHaveBeenCalledWith("overflow", "auto", "important");
  });

  it("does not release another overlay through a duplicate cleanup", () => {
    const element = body();
    const first = lockBodyScroll(element);
    const second = lockBodyScroll(element);
    first(); first();
    expect(element.style.overflow).toBe("hidden");
    second();
    expect(element.style.overflow).toBe("");
    const third = lockBodyScroll(element);
    first();
    expect(element.style.overflow).toBe("hidden");
    third();
    expect(element.style.overflow).toBe("");
  });

  it("preserves existing hidden styles and external changes", () => {
    const hidden = body("hidden");
    lockBodyScroll(hidden)();
    expect(hidden.style.overflow).toBe("hidden");
    const changed = body();
    const unlock = lockBodyScroll(changed);
    changed.style.overflow = "clip";
    unlock();
    expect(changed.style.overflow).toBe("clip");
  });
});
