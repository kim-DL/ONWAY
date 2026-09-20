import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BottomSheet } from "@/components/ui/bottom-sheet";

import { AdminDialog } from "./admin-dialog";

describe("administrator modal safety contract", () => {
  it.each([false, true])("uses the shared native modal with every close path guarded (busy=%s)", (busy) => {
    const onClose = vi.fn();
    const modal = AdminDialog({ title: "직원 등록", eyebrow: "직원 관리", busy, onClose, children: "입력한 내용" });
    expect(modal.type).toBe(BottomSheet);
    expect(modal.props.open).toBe(true);
    expect(modal.props.title).toBe("직원 등록");
    expect(modal.props.description).toBe("직원 관리");
    expect(modal.props.dismissible).toBe(!busy);
    expect(modal.props.beforeClose()).toBe(!busy);
    // Guard the callback itself too, not only the disabled close button.
    modal.props.onClose();
    expect(onClose).toHaveBeenCalledTimes(busy ? 0 : 1);
    expect(modal.props.children.props["aria-busy"]).toBe(busy);
    expect(modal.props.children.props.children).toBe("입력한 내용");
  });

  it("renders an accessible native dialog with a disabled close target while saving", () => {
    const html = renderToStaticMarkup(AdminDialog({
      title: "직원 등록", eyebrow: "직원 관리", busy: true, onClose: vi.fn(), children: "입력한 내용",
    }));
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain('aria-describedby="');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="닫기"/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("입력한 내용");
  });

  it("generates distinct accessible titles for simultaneous modal instances", () => {
    const props = { eyebrow: "직원 관리", onClose: vi.fn(), children: "입력한 내용" };
    const html = renderToStaticMarkup(createElement(Fragment, null,
      AdminDialog({ ...props, title: "직원 등록" }),
      AdminDialog({ ...props, title: "등록 확인" })));
    const titles = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
    expect(titles).toHaveLength(2);
    expect(new Set(titles).size).toBe(2);
    for (const title of titles) expect(html).toContain(`id="${title}"`);
  });
});
