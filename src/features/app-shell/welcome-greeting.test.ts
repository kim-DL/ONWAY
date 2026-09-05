import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { WelcomeGreeting } from "./welcome-greeting";

describe("welcome mascot", () => {
  it("renders the greeting and a silent still before hydration, without adding a control", () => {
    const html = renderToString(createElement(WelcomeGreeting, {
      className: "shell-greeting", title: createElement("h1", { id: "page-title" }, "학교의 흐름."),
    }, "직원님, 반가워요."));
    expect(html).toContain("직원님, 반가워요.");
    expect(html).toContain("data-greeting-copy");
    expect(html).toContain('data-motion="paused"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('alt=""');
    expect(html).toContain("/brand/bloub-welcome-still-v2.png");
    expect(html).not.toContain("/brand/bloub-welcome-v2.webp");
    expect(html).toContain('<h1 id="page-title">학교의 흐름.</h1>');
    expect(html.indexOf("data-greeting-copy")).toBeLessThan(html.indexOf("data-welcome-headline"));
    expect(html.indexOf("data-welcome-title")).toBeLessThan(html.indexOf("data-welcome-mascot"));
    expect(html).not.toContain("<button");
  });

  it("ships the replacement transparent 10-second cycle with indefinite repetition and a small still", async () => {
    const animation = new URL("../../../public/brand/bloub-welcome-v2.webp", import.meta.url);
    const poster = new URL("../../../public/brand/bloub-welcome-still-v2.png", import.meta.url);
    const moving = await sharp(fileURLToPath(animation), { animated: true }).metadata();
    const still = await sharp(fileURLToPath(poster)).metadata();
    expect(moving).toMatchObject({ width: 320, pageHeight: 320, pages: 200, loop: 0, hasAlpha: true });
    expect(moving.delay).toEqual(Array(200).fill(50));
    expect(still).toMatchObject({ width: 320, height: 320, hasAlpha: true });
    expect(statSync(animation).size).toBeLessThan(320_000);
    expect(statSync(poster).size).toBeLessThan(10_000);
  });
});
