import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, webkit, expect as expectBrowser, type Browser, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMcpHttpApp } from "../../src/mcp/http.js";
import { fixture, principal } from "./fixture.js";

for (const engine of ["chromium", "webkit"] as const) describe.skipIf(process.env.MCP_BROWSER_TEST !== "true")(`PIN consent / ${engine}`, () => {
  let browser: Browser;
  const pages: Page[] = [], servers: Server[] = [];
  beforeAll(async () => { browser = await ({ chromium, webkit }[engine]).launch({ headless: true }); });
  afterEach(async () => {
    await Promise.all(pages.splice(0).map((page) => page.close()));
    for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  afterAll(async () => { await browser?.close(); });
  async function mount() {
    const server = createServer(); servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, f = fixture(origin);
    f.config.allowedRedirectUris = [`${origin}/callback`];
    const app = createMcpHttpApp(f.oauth, (ip) => ip, undefined, { metricSink: () => {} });
    server.on("request", (request, response) => {
      if (request.url?.startsWith("/callback?")) { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end("<h1>연결 완료</h1>"); }
      else app(request, response);
    });
    const { request } = await f.setup(); f.identity.login.mockClear();
    const page = await browser.newPage({ viewport: { width: 390, height: 720 } }); pages.push(page);
    await page.goto(`${origin}/authorize?${new URLSearchParams(request)}`);
    return { page, f, origin };
  }
  it("submits PIN consent once during double clicks, Enter and repeated form submission", async () => {
    const { page, f } = await mount();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    f.identity.login.mockImplementation(async () => { await waiting; return principal; });
    let posts = 0; page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/authorize") posts++; });
    try {
      await page.locator("#pin").fill("123456");
      const pending = await page.evaluate(() => {
        const form = document.querySelector("form")!, button = document.querySelector("button")!;
        button.click(); button.click(); form.requestSubmit(); form.requestSubmit();
        return { disabled: button.disabled, status: document.getElementById("status")!.textContent };
      });
      expect(pending.disabled).toBe(true); expect(pending.status).toContain("잠시 기다려");
      await vi.waitFor(() => expect(f.identity.login).toHaveBeenCalledTimes(1));
      await page.keyboard.press("Enter");
      release();
      await expectBrowser(page.getByRole("heading")).toHaveText("연결 완료");
      expect(posts).toBe(1); expect(f.identity.login).toHaveBeenCalledTimes(1);
    } finally { release(); }
  });
  it("explains expired browser consent without echoing PIN and preserves JSON OAuth errors", async () => {
    const { page, f, origin } = await mount();
    f.advance(10 * 60_000 + 1);
    await page.locator("#pin").fill("123456"); await page.getByRole("button").click();
    await expectBrowser(page.getByRole("heading")).toHaveText("연결을 다시 확인해 주세요");
    expect(await page.locator("body").innerText()).toContain("ChatGPT");
    expect(await page.locator("body").innerText()).not.toContain("123456");
    expect(f.identity.login).not.toHaveBeenCalled();
    const response = await fetch(`${origin}/authorize`, { method: "POST", headers: { origin, Accept: "application/json", "Content-Type": "application/json" }, body: "{}" });
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});
