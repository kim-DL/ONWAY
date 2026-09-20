import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Icon, type IconName } from "./icon";

// The exhaustive record makes a newly added icon part of this regression suite.
const iconNames = Object.keys({
  "arrow-left": true,
  "arrow-down": true,
  "arrow-up": true,
  bell: true,
  building: true,
  calendar: true,
  camera: true,
  check: true,
  "chevron-right": true,
  clipboard: true,
  clock: true,
  close: true,
  copy: true,
  download: true,
  home: true,
  key: true,
  location: true,
  logout: true,
  phone: true,
  plus: true,
  refresh: true,
  route: true,
  search: true,
  settings: true,
  sparkles: true,
  trash: true,
  upload: true,
  "wifi-off": true,
  "zoom-in": true,
  user: true,
} satisfies Record<IconName, true>) as IconName[];

describe("Icon", () => {
  it.each(iconNames)("preserves %s geometry and accessible decorative defaults", (name) => {
    const markup = renderToStaticMarkup(createElement(Icon, { name }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('height="20"');
    expect(markup).toContain('width="20"');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="1.8"');
    expect(markup).toMatch(/<(?:path|circle|rect)\b/u);
    expect(markup).not.toMatch(/<button|tabindex=/u);
  });

  it("shares immutable geometry between renders without sharing wrapper props", () => {
    for (const name of iconNames) {
      const first = Icon({ name, size: 16, className: "first" });
      const second = Icon({ name, size: 28, className: "second" });
      expect(first).not.toBe(second);
      expect(first.props.children).toBe(second.props.children);
      expect(first.props.width).toBe(16);
      expect(second.props.width).toBe(28);
      expect(first.props.className).toBe("first");
      expect(second.props.className).toBe("second");
    }
  });

  it("retains a distinct shape for all supported names", () => {
    const shapes = iconNames.map((name) => renderToStaticMarkup(createElement(Icon, { name })));
    expect(new Set(shapes).size).toBe(iconNames.length);
  });

  it("preserves caller sizing, styling and explicit accessible label overrides", () => {
    const markup = renderToStaticMarkup(createElement(Icon, {
      name: "phone",
      size: 24,
      width: 32,
      className: "contact-icon",
      strokeWidth: 2,
      "aria-hidden": false,
      "aria-label": "전화",
      role: "img",
    }));
    expect(markup).toContain('height="24"');
    expect(markup).toContain('width="32"');
    expect(markup).toContain('class="contact-icon"');
    expect(markup).toContain('stroke-width="2"');
    expect(markup).toContain('aria-hidden="false"');
    expect(markup).toContain('aria-label="전화"');
    expect(markup).toContain('role="img"');
  });
});
