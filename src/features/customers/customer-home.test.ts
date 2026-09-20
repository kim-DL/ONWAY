import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerHome } from "./customer-home";

describe("customer home", () => {
  it("shares the delivery headline/search patterns with a clear customer message", () => {
    const html = renderToStaticMarkup(createElement(CustomerHome, {
      greeting: "김대인 부장님, 좋은 아침이에요.", onOpenSearch: () => undefined,
    }));
    expect(html).toContain("shell-hero");
    expect(html).toContain("shell-greeting");
    expect(html).toContain("school-search-trigger");
    expect(html).toContain('id="customer-heading"');
    expect(html).toContain("거래처 정보를");
    expect(html).toContain("한눈에.");
    expect(html).toContain("김대인 부장님, 좋은 아침이에요.");
    expect(html).toContain("거래처 이름으로 찾기");
    expect(html).not.toContain("납품 정보,");
    expect(html).not.toContain("주소</small>");
    expect(html).not.toContain("거래처 등록");
  });

  it("exposes employee registration with a native disabled state when unavailable", () => {
    const html = renderToStaticMarkup(createElement(CustomerHome, {
      greeting: "반가워요.", onOpenSearch: () => undefined,
      onRegister: () => undefined, registerDisabled: true,
    }));
    expect(html).toContain("거래처 등록");
    expect(html).toContain('disabled=""');
  });

  it("replaces the large greeting and secondary actions with an accessible compact search header", () => {
    const html = renderToStaticMarkup(createElement(CustomerHome, {
      greeting: "반가워요.", replayKey: "customer-entry-2", onOpenSearch: () => undefined,
      onRegister: () => undefined, onOpenDirectory: () => undefined,
      searchContent: createElement("input", { "aria-label": "거래처명 또는 초성 검색" }),
    }));
    expect(html).toContain('data-customer-home');
    expect(html).toContain('data-customer-search-header');
    expect(html).toContain('id="customer-heading"');
    expect(html).toContain('aria-label="거래처명 또는 초성 검색"');
    expect(html).toContain("거래처 검색");
    expect(html).not.toContain("shell-hero");
    expect(html).not.toContain("거래처 정보를");
    expect(html).not.toContain("반가워요.");
    expect(html).not.toContain("거래처 등록");
    expect(html).not.toContain("거래처 전체보기");
    expect(html).not.toContain("거래처 이름으로 찾기");
  });
});
