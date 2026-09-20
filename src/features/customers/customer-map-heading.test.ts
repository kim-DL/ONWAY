import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerMap } from "./customer-map";

const props = { point: { latitude: 36.35, longitude: 127.38 }, name: "테스트 거래처", onMarkerClick: () => undefined };

describe("customer map heading composition", () => {
  it("retains the standalone heading by default", () => {
    const html = renderToStaticMarkup(createElement(CustomerMap, props));
    expect(html).toContain("실제 납품 지점</strong>");
    expect(html).toContain("핀 정보");
  });

  it("omits only the redundant heading while preserving every map control", () => {
    const html = renderToStaticMarkup(createElement(CustomerMap, { ...props, hideHeading: true }));
    expect(html).not.toContain("실제 납품 지점</strong>");
    expect(html).toContain("핀 정보");
    expect(html).toContain('aria-label="테스트 거래처 납품 지점 지도"');
    expect(html).toContain('aria-label="지도 직접 조작"');
    expect(html).toContain('aria-label="지도 확대"');
    expect(html).toContain('aria-label="지도 축소"');
    expect(html).toContain('aria-label="납품 지점으로 지도 이동"');
  });
});
