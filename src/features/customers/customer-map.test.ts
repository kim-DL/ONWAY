import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerMap } from "./customer-map";

describe("CustomerMap initial accessible states", () => {
  it("does not render a map canvas, fake marker or request when no point exists", () => {
    const markup = renderToStaticMarkup(createElement(CustomerMap, { name: "테스트 거래처", point: null }));
    expect(markup).toContain("실제 납품 위치가 등록되지 않았습니다.");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("data-customer-map-canvas");
    expect(markup).not.toContain("script");
  });

  it("keeps an invalid coordinate out of the SDK", () => {
    const markup = renderToStaticMarkup(createElement(CustomerMap, { name: "테스트 거래처", point: { latitude: NaN, longitude: 127 } }));
    expect(markup).toContain("실제 납품 위치가 등록되지 않았습니다.");
    expect(markup).not.toContain("data-customer-map-canvas");
  });

  it("reserves a map region with accessible controls while the SDK loads", () => {
    const markup = renderToStaticMarkup(createElement(CustomerMap, {
      name: "테스트 거래처", point: { latitude: 36.351, longitude: 127.381 }, onMarkerClick() {},
    }));
    expect(markup).toContain("지도를 불러오고 있어요.");
    expect(markup).toContain('aria-label="지도 직접 조작"');
    expect(markup).toContain('aria-label="지도 확대"');
    expect(markup).toContain('aria-label="지도 축소"');
    expect(markup).toContain('aria-label="납품 지점으로 지도 이동"');
    expect(markup).toContain("핀 정보");
    expect(markup).toContain('data-interactive="false"');
    expect(markup).not.toContain("36.351");
    expect(markup).not.toContain("127.381");
  });

  it("only shows the editable instruction and active interaction for admin map editing", () => {
    const markup = renderToStaticMarkup(createElement(CustomerMap, {
      name: "위치 편집", point: { latitude: 36.351, longitude: 127.381 }, editable: true,
    }));
    expect(markup).toContain("핀을 끌거나 지도를 눌러");
    expect(markup).toContain('data-interactive="true"');
    expect(markup).not.toContain("핀 정보");
  });
});
