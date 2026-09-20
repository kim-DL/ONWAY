import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { useRecentCustomers } from "./use-recent-customers";

describe("recent customer SSR", () => {
  it("renders a stable empty initial state with no window or localStorage", () => {
    function Probe() {
      const view = useRecentCustomers({ uid: "SSR", claims: { sessionVersion: 1, permissionsVersion: 1 } } as AuthenticatedSession, []);
      return createElement("span", null, `${view.ready}:${view.recentCustomers.length}`);
    }
    expect(typeof window).toBe("undefined");
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>false:0</span>");
  });
});
