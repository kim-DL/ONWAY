import { createElement } from "react";
import { readFileSync } from "node:fs";
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

  it("shares headline text tokens with the selected mode buttons", () => {
    const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const header = readFileSync(new URL("./app-shell-header.module.css", import.meta.url), "utf8");
    const greeting = readFileSync(new URL("./welcome-greeting.module.css", import.meta.url), "utf8");
    for (const [mode, color] of [["delivery", "#1b64da"], ["customer", "#247647"], ["sales", "#FA6F42"]]) {
      expect(globals).toContain(`--mode-${mode}-text: ${color}`);
      expect(header).toContain(`color: var(--mode-${mode}-text)`);
      expect(greeting).toContain(`color: var(--mode-${mode}-text)`);
    }
    expect(greeting).toMatch(/@media \(forced-colors: active\)[\s\S]*color: CanvasText/);
  });

  it("varies orb size on independent bounded rhythms without random rendering or layout animation", () => {
    const css = readFileSync(new URL("../../components/ui/quantum-cloud-loader.module.css", import.meta.url), "utf8");
    const component = readFileSync(new URL("../../components/ui/quantum-cloud-loader.tsx", import.meta.url), "utf8");
    const durations = [...css.matchAll(/--breath-duration: ([\d.]+)s/g)].map((match) => Number(match[1]));
    expect(new Set(durations).size).toBe(4);
    expect(durations.every((duration) => duration >= 7 && duration <= 14)).toBe(true);
    const scales = [...css.matchAll(/--breath-(?:small|large): ([\d.]+)/g)].map((match) => Number(match[1]));
    expect(scales).toHaveLength(8);
    expect(scales.every((scale) => scale >= .7 && scale <= 1.4)).toBe(true);
    expect(css).toContain('animation: cloud-breathe');
    expect(css).toContain('.cloud .particle, .cloud .core');
    expect(component).not.toMatch(/Math\.random|setInterval|requestAnimationFrame/);
    expect(css.slice(css.indexOf('@keyframes coral-orbit'))).not.toMatch(/(?:width|height|box-shadow|filter):/);
  });
});
