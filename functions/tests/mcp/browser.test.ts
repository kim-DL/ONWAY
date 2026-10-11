import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { createMcpHttpApp } from "../../src/mcp/http.js";
import { fixture } from "./fixture.js";

describe.skipIf(process.env.MCP_BROWSER_TEST !== "true")("MCP browser consent", () => {
  it("submits PIN with an HttpOnly flow cookie and follows the approved callback under CSP", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const f = fixture(origin);
    server.on("request", createMcpHttpApp(f.oauth, (ip) => ip));
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.setDefaultTimeout(5_000);
      page.setDefaultNavigationTimeout(5_000);
      const errors: string[] = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("https://chatgpt.com/connector_platform_oauth_redirect?*", (route) => route.fulfill({
        status: 200, contentType: "text/html", body: "<!doctype html><title>OAuth callback received</title>",
      }));
      const { request, exchange } = await f.setup();
      await page.goto(`${origin}/authorize?${new URLSearchParams({ ...request, ui_locales: "ko-KR" })}`);
      await page.locator("#pin").fill("482915"); // Synthetic fixture; never a real account.
      await page.getByRole("button", { name: "확인하고 조회 연결 허용" }).click();
      expect(await page.locator("body").innerText()).not.toContain("error");
      expect(f.identity.login).toHaveBeenCalledTimes(2);
      await page.waitForURL((url) => url.pathname === "/connector_platform_oauth_redirect");
      const callback = new URL(page.url());
      expect(callback.searchParams.get("iss")).toBe(origin);
      expect(callback.searchParams.get("state")).toBe(request.state);
      expect(errors.filter((error) => /Content Security Policy|Refused to send form/i.test(error))).toEqual([]);
      await expect(f.oauth.token({ ...exchange, code: callback.searchParams.get("code") })).resolves.toHaveProperty("access_token");
    } finally {
      await browser?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);
});
