import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WelcomeGreeting } from "./welcome-greeting";
import { QuantumCloudLoader } from "../../components/ui/quantum-cloud-loader";

describe("welcome quantum artwork", () => {
  it("renders a paused decorative cloud beside the title before hydration, without an image or loading state", () => {
    const html = renderToString(createElement(WelcomeGreeting, {
      className: "shell-greeting", titleId: "page-title", title: "오늘 움직일", accent: "학교의 흐름.",
    }, "직원님, 반가워요."));
    expect(html).toContain("직원님, 반가워요.");
    expect(html).toContain("data-greeting-copy");
    expect(html).toContain('data-motion="paused"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<h1 id="page-title"');
    expect(html).toContain("오늘 움직일");
    expect(html).toContain("학교의 흐름.");
    expect(html.indexOf("data-greeting-copy")).toBeLessThan(html.indexOf("data-welcome-headline"));
    expect(html.indexOf("data-welcome-title")).toBeLessThan(html.indexOf("data-welcome-mascot"));
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("bloub");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-busy');
    expect(html.match(/data-quantum-particle=/g)).toHaveLength(4);
  });

  it("defaults reusable artwork to paused with four distinct particles", () => {
    const html = renderToString(createElement(QuantumCloudLoader));
    expect(html).toContain('data-motion="paused"');
    for (const particle of ["coral", "blue", "champagne", "sage"]) {
      expect(html).toContain(`data-quantum-particle="${particle}"`);
    }
    expect(renderToString(createElement(QuantumCloudLoader, { paused: false }))).toContain('data-motion="running"');
  });
});
