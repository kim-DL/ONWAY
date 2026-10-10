import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, webkit, expect as expectBrowser, type Browser, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMcpHttpApp } from "../../src/mcp/http.js";
import { fixture } from "./fixture.js";

const endpoint = "https://onnuriway-mcp.web.app/mcp";
for (const engine of ["chromium", "webkit"] as const) describe.skipIf(process.env.MCP_BROWSER_TEST !== "true")(`public MCP landing / ${engine}`, () => {
  let browser: Browser, server: Server, origin: string;
  const pages: Page[] = [];
  beforeAll(async () => {
    browser = await ({ chromium, webkit }[engine]).launch({ headless: true });
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    server.on("request", createMcpHttpApp(fixture(origin).oauth, (ip) => ip, undefined, { metricSink: () => {} }));
  });
  afterEach(async () => { await Promise.all(pages.splice(0).map((page) => page.close())); });
  afterAll(async () => { await browser?.close(); server?.closeAllConnections(); if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
  async function mount(width = 390, height = 844, reducedMotion: "reduce" | "no-preference" = "no-preference") {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion }); pages.push(page);
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
    const response = await page.goto(`${origin}/mcp`);
    expect(response?.status()).toBe(200); expect(response?.headers()["content-type"]).toContain("text/html");
    await page.evaluate(() => document.fonts.ready);
    return { page, failures };
  }
  it("renders the approved logo/fonts without overflow at desktop, small mobile and rotation sizes", async () => {
    const { page, failures } = await mount();
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width: width!, height: height! });
      await expectBrowser(page.locator("h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const state = await page.evaluate(() => {
        const logo = document.querySelector<HTMLImageElement>(".brand-logo")!;
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          logo: logo.complete && logo.naturalWidth === 1200,
          title: document.fonts.check('700 24px "OnnuriEditorial"', "급식길"), body: document.fonts.check('400 16px "OnnuriText"', "온누리") };
      });
      expect(state, JSON.stringify({ width, failures, fonts: await page.evaluate(() => Array.from(document.fonts).map(f => ({ family: f.family, status: f.status }))) })).toEqual({ overflow: false, logo: true, title: true, body: true });
      for (const button of await page.locator("[data-copy]").all()) {
        await button.scrollIntoViewIfNeeded(); const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44); await button.click({ trial: true });
      }
      if (process.env.MCP_LANDING_SCREENSHOTS) await page.screenshot({ path: `${process.env.MCP_LANDING_SCREENSHOTS}/${engine}-${width}.png`, fullPage: true });
    }
    expect(failures).toEqual([]);
  });
  it("copies the exact endpoint from both controls and offers selected text when clipboard is blocked", async () => {
    const { page } = await mount();
    // Same API/CSP execution path with an observable clipboard; no OS clipboard access needed.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } } });
    });
    for (const button of await page.locator("[data-copy]").all()) {
      await page.evaluate(() => { delete document.documentElement.dataset.copied; });
      await button.click();
      await expectBrowser(page.locator("html")).toHaveAttribute("data-copied", endpoint);
      await expectBrowser(page.getByRole("status")).toContainText("복사했습니다");
    }
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } } });
      document.execCommand = () => false;
    });
    await page.locator("[data-copy]").first().click();
    await expectBrowser(page.getByRole("status")).toContainText("길게 눌러 복사");
    expect(await page.locator("#server-url").evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart!, input.selectionEnd!))).toBe(endpoint);
  });
  it("supports keyboard navigation and reduced motion without pointer animation", async () => {
    const { page } = await mount(1440, 1000, "reduce");
    await page.keyboard.press("Tab"); await expectBrowser(page.locator(".skip")).toBeFocused();
    await page.keyboard.press("Enter"); expect(new URL(page.url()).hash).toBe("#main");
    await page.locator(".visual").hover();
    expect(await page.locator(".scene").evaluate((element: HTMLElement) => element.style.transform)).toBe("");
    expect(await page.locator(".scene").evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    await page.getByRole("link", { name: "연결 방법 보기" }).click();
    await expectBrowser(page.locator("#connect")).toBeInViewport();
    // Landing CSP deliberately disallows application/API network calls.
    expect(await page.evaluate(async () => { try { await fetch("/mcp"); return false; } catch { return true; } })).toBe(true);
  });
});
