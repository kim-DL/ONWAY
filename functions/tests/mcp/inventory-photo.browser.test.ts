import { chromium, webkit, expect as expectBrowser, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PHOTO_VIEW_HTML } from "../../src/mcp/photo-view.js";
const photoId = "49f0aeec-f503-4c44-88a2-36a2f3c9f665";
type Image = { productId: string; photoId: string; name: string; manufacturer: string; specification: string; variant: string; mimeType: string; data: string };
type Reply = { isError?: boolean; _meta?: { inventoryPhoto?: Image; inventoryNotice?: { message: string }; error?: { code: string } } };
declare global { interface Window { inventoryPhotoTest: { calls: { name: string; arguments: Record<string, unknown> }[]; reply: Reply; send: (result: Reply) => void } } }
for (const engine of ["chromium", "webkit"] as const) describe.skipIf(process.env.MCP_BROWSER_TEST !== "true")(`inventory photo UI / ${engine}`, () => {
  let browser: Browser, thumbnail: Image, preview: Image; const pages: Page[] = [];
  beforeAll(async () => {
    browser = await ({ chromium, webkit }[engine]).launch({ headless: true });
    const data = (await sharp({ create: { width: 320, height: 480, channels: 3, background: "#327477" } }).webp().toBuffer()).toString("base64");
    thumbnail = { productId: "synthetic-product", photoId, name: "합성 상품 <img onerror=alert(1)>", manufacturer: "합성 제조사", specification: "1kg", variant: "thumbnail", mimeType: "image/webp", data };
    preview = { ...thumbnail, variant: "preview" };
  });
  afterEach(async () => { await Promise.all(pages.splice(0).map((page) => page.close())); });
  afterAll(async () => { await browser?.close(); });
  async function mount(initial: Reply = { _meta: { inventoryPhoto: thumbnail } }) {
    const page = await browser.newPage({ viewport: { width: 320, height: 480 } }); pages.push(page);
    const network: string[] = [], errors: string[] = [];
    page.on("request", (request) => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><iframe sandbox="allow-scripts"></iframe>');
    await page.evaluate(({ html, initial, preview }) => {
      const frame = document.querySelector("iframe")!, post = (message: unknown) => frame.contentWindow!.postMessage(message, "*");
      const state = window.inventoryPhotoTest = { calls: [], reply: { _meta: { inventoryPhoto: preview } }, send: (result: Reply) => post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result }) };
      window.addEventListener("message", (event) => {
        if (event.source !== frame.contentWindow) return;
        const m = event.data;
        if (m.method === "ui/initialize") post({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2026-01-26", hostCapabilities: { serverTools: {} }, hostContext: { displayMode: "inline", availableDisplayModes: ["inline"] } } });
        if (m.method === "ui/notifications/initialized") state.send(initial);
        if (m.method === "tools/call") { state.calls.push(m.params); post({ jsonrpc: "2.0", id: m.id, result: state.reply }); }
      });
      frame.srcdoc = html;
    }, { html: PHOTO_VIEW_HTML, initial, preview });
    const frame = page.frameLocator("iframe"); await frame.locator("#status").waitFor();
    return { page, frame, network, errors };
  }
  it("renders the initial thumbnail without a follow-up call and expands the same authenticated product photo", async () => {
    const { page, frame, network, errors } = await mount();
    await expectBrowser(frame.locator("#photo")).toBeVisible();
    expect(await page.evaluate(() => window.inventoryPhotoTest.calls)).toEqual([]);
    expect(await frame.locator("#company").innerText()).toBe(thumbnail.name);
    expect(await frame.locator("#caption").innerText()).toBe("합성 제조사 · 1kg");
    expect(await frame.locator("#company img").count()).toBe(0);
    expect(await frame.locator("body").innerText()).not.toMatch(/납품완료|등록 시각 없음|7일|synthetic-product|49f0aeec/);
    await frame.locator("#open").click(); await expectBrowser(frame.locator("#evidence")).toBeVisible();
    expect(await page.evaluate(() => window.inventoryPhotoTest.calls)).toEqual([{ name: "get_inventory_photo", arguments: { productId: thumbnail.productId, photoId, variant: "preview" } }]);
    await frame.locator("#zoom-in").click(); await expectBrowser(frame.locator("#zoom")).toHaveText("125%");
    await frame.locator("#zoom-fit").click(); await expectBrowser(frame.locator("#zoom")).toHaveText("100%");
    const box = await frame.locator("#zoom-in").boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(480);
    await page.setViewportSize({ width: 667, height: 320 });
    const rotated = await frame.locator("#zoom-in").boundingBox(); expect(rotated!.y + rotated!.height).toBeLessThanOrEqual(320);
    await frame.locator("#close").click(); await expectBrowser(frame.locator("#viewer")).not.toBeVisible();
    expect(await page.evaluate(() => window.inventoryPhotoTest.calls.length)).toBe(1);
    expect(network).toEqual([]); expect(errors).toEqual([]);
  });
  it("rejects a different product image and clears a removed attachment instead of showing expired-delivery guidance", async () => {
    const { page, frame } = await mount(); await expectBrowser(frame.locator("#photo")).toBeVisible();
    await page.evaluate((photo) => { window.inventoryPhotoTest.reply = { _meta: { inventoryPhoto: { ...photo, productId: "other-product" } } }; }, preview);
    await frame.locator("#open").click(); await expectBrowser(frame.locator("#retry")).toBeVisible();
    await expectBrowser(frame.locator("#evidence")).not.toBeVisible();
    await page.evaluate(() => { window.inventoryPhotoTest.reply = { isError: true, _meta: { error: { code: "NOT_FOUND" } } }; });
    await frame.locator("#retry").click(); await expectBrowser(frame.locator("#viewer")).not.toBeVisible();
    await expectBrowser(frame.locator("#photo")).not.toBeVisible();
    expect(await frame.locator("#status").innerText()).toContain("교체되었거나 삭제");
    expect(await frame.locator("#status").innerText()).not.toMatch(/보관기간|만료/);
  });
  it("shows no-photo notices and clears private content on revocation", async () => {
    const empty = await mount({ _meta: { inventoryNotice: { message: "등록된 상품 사진이 없습니다." } } });
    await expectBrowser(empty.frame.locator("#status")).toContainText("없습니다"); expect(await empty.page.evaluate(() => window.inventoryPhotoTest.calls.length)).toBe(0);
    const { page, frame } = await mount(); await expectBrowser(frame.locator("#photo")).toBeVisible();
    await page.evaluate(() => { window.inventoryPhotoTest.reply = { isError: true, _meta: { error: { code: "FORBIDDEN" } } }; });
    await frame.locator("#open").click(); await expectBrowser(frame.locator("#card")).not.toBeVisible();
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull(); expect(await frame.locator("#evidence").getAttribute("src")).toBeNull();
    expect(await frame.locator("body").innerText()).not.toContain(thumbnail.name);
  });
});
