import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Icon } from "./icon";
import { InitialStatusIcon } from "./initial-status-icon";

describe("InitialStatusIcon", () => {
  it.each(["refresh", "wifi-off"] as const)("matches the registry markup for %s", (name) => {
    for (const props of [
      { name },
      { name, size: 18 },
      {
        name,
        size: 24,
        width: 32,
        className: "status-icon",
        strokeWidth: 2,
        "aria-hidden": false as const,
        "aria-label": "상태",
        role: "img",
        focusable: false as const,
      },
    ]) {
      expect(renderToStaticMarkup(createElement(InitialStatusIcon, props)))
        .toBe(renderToStaticMarkup(createElement(Icon, props)));
    }
  });
});
