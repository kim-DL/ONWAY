import { chromium, webkit, devices, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PHOTO_VIEW_HTML } from "../../src/mcp/photo-view.js";

type Insets = { top: number; right: number; bottom: number; left: number };
type Geometry = { height: number; insets: Insets };
type Rpc = { id?: string; method?: string; params?: Record<string, unknown> };
declare global { interface Window { mobilePhotoHost: {
  calls: Rpc[]; heights: number[]; mode: string; geometry: Geometry;
  update: (geometry: Geometry) => void; send: (message: unknown) => void;
} } }
const firstId = "c3bc6631-22fb-4f14-b622-bb852652c891", secondId = "15695901-4704-49ce-adc1-9a8c2f5f29f6";
const geometry = (height: number, bottom: number, top = 0, sides = 0): Geometry => ({ height, insets: { top, bottom, left: sides, right: sides } });
let bytes: string;

async function mount(browser: Browser, engine: string, bridge: "standard" | "chatgpt", initial: Geometry, longNames = false) {
  const page = await browser.newPage({ ...(engine === "webkit" ? devices["iPhone 13"] : devices["Pixel 7"]), viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  const errors: string[] = [], requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}#host-ui{display:none;position:fixed;inset:auto 0 0;height:100px;background:#445;z-index:10}</style><iframe id="view" sandbox="allow-scripts"></iframe><div id="host-ui" aria-label="Synthetic host composer"></div>');
  await page.evaluate(({ html, bridge, initial, bytes, firstId, secondId, longNames }) => {
    const frame = document.querySelector<HTMLIFrameElement>("#view")!;
    const send = (message: unknown) => frame.contentWindow!.postMessage(message, "*");
    const state = window.mobilePhotoHost = { calls: [] as Rpc[], heights: [] as number[], mode: "inline", geometry: initial, send,
      update: (value: Geometry) => {
        state.geometry = value;
        document.getElementById("host-ui")!.style.height = Math.max(0, innerHeight - value.height + value.insets.bottom) + "px";
        if (bridge === "standard") send({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { containerDimensions: { maxHeight: value.height }, safeAreaInsets: value.insets } });
        else send({ testGlobals: { maxHeight: value.height, safeArea: { insets: value.insets } } });
      } };
    const photo = (photoId: string, variant = "thumbnail") => ({ photoId, variant, customerId: "synthetic-customer", customerName: longNames ? "합성 납품업체 ".repeat(20) : "합성 납품업체",
      createdByEmployeeId: "synthetic-employee", createdByName: longNames ? "합성 직원 ".repeat(20) : "합성 직원", createdAt: "2026-10-08T07:00:00Z", mimeType: "image/webp", data: bytes });
    const first = photo(firstId), second = photo(secondId);
    const result = { _meta: { deliveryGallery: { employeeId: first.createdByEmployeeId, customerId: first.customerId, customerName: first.customerName,
      date: "2026-10-08", photos: [first, second], after: null, nextCursor: null }, deliveryPhoto: first } };
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      const message = event.data as Rpc;
      if (message.method === "ui/initialize" && bridge === "standard") send({ jsonrpc: "2.0", id: message.id, result: {
        protocolVersion: "2026-01-26", hostCapabilities: { serverTools: {} }, hostContext: { displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"],
          platform: "mobile", containerDimensions: { maxHeight: initial.height }, safeAreaInsets: initial.insets },
      } });
      if (message.method === "ui/notifications/initialized") send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result });
      if (message.method === "ui/request-display-mode") {
        state.mode = message.params!.mode as string;
        send({ jsonrpc: "2.0", id: message.id, result: { mode: state.mode } });
      }
      if (message.method === "ui/notifications/size-changed") state.heights.push(message.params!.height as number);
      if (message.method === "tools/call") {
        state.calls.push(message);
        const args = message.params!.arguments as { photoId: string; variant: string };
        send({ jsonrpc: "2.0", id: message.id, result: { _meta: { deliveryPhoto: photo(args.photoId, args.variant) } } });
      }
    });
    // Exercise the legacy bridge with real async postMessage tool replies, but no credentials/network.
    const compatibility = '<script>(()=>{let id=0;const pending=new Map();window.openai=' + JSON.stringify({ displayMode: "inline", maxHeight: initial.height, safeArea: { insets: initial.insets }, userAgent: { device: { type: "mobile" } }, toolResponseMetadata: result })
      + ';window.openai.callTool=(name,args)=>new Promise(resolve=>{const key="compat-"+(++id);pending.set(key,resolve);parent.postMessage({jsonrpc:"2.0",id:key,method:"tools/call",params:{name,arguments:args}},"*")});window.openai.requestDisplayMode=async({mode})=>{window.openai.displayMode=mode;return{mode}};addEventListener("message",e=>{if(e.source!==parent)return;if(e.data.testGlobals)dispatchEvent(new CustomEvent("openai:set_globals",{detail:{globals:e.data.testGlobals}}));const p=pending.get(e.data.id);if(p){pending.delete(e.data.id);p(e.data.result)}})})();</script>';
    frame.srcdoc = bridge === "chatgpt" ? html.replace("<script>", compatibility + "<script>") : html;
    state.update(initial);
  }, { html: PHOTO_VIEW_HTML, bridge, initial, bytes, firstId, secondId, longNames });
  const frame = page.frameLocator("#view");
  await frame.locator("#photo:not([hidden])").waitFor();
  await frame.locator("#open").tap(); await frame.locator("#evidence:not([hidden])").waitFor();
  await page.locator("#host-ui").evaluate((node) => { node.style.display = "block"; });
  return { page, frame, errors, requests };
}

async function reachable(page: Page) {
  const frame = page.frameLocator("#view");
  const bounds = await page.evaluate(() => ({ width: innerWidth, ...window.mobilePhotoHost.geometry }));
  for (const id of ["zoom-out", "zoom-in", "zoom-fit", "close", "viewer-prev", "viewer-next"]) {
    const box = (await frame.locator("#" + id).boundingBox())!;
    expect(box.width, id + " touch width").toBeGreaterThanOrEqual(44);
    expect(box.height, id + " touch height").toBeGreaterThanOrEqual(44);
    expect(box.y, id + " safe top").toBeGreaterThanOrEqual(bounds.insets.top);
    expect(box.y + box.height, id + " safe bottom").toBeLessThanOrEqual(bounds.height - bounds.insets.bottom + .5);
    expect(box.x, id + " safe left").toBeGreaterThanOrEqual(bounds.insets.left);
    expect(box.x + box.width, id + " safe right").toBeLessThanOrEqual(bounds.width - bounds.insets.right + .5);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x, y }), id + " not covered by host").toBe("view");
    expect(await frame.locator("body").evaluate((_body, { x, y, id }) => document.elementFromPoint(x, y)?.closest("button")?.id === id, { x, y, id }), id + " hit target").toBe(true);
  }
  expect(await frame.locator(".panel").evaluate((node) => node.scrollHeight > node.clientHeight + 1), "panel must not scroll its toolbar away").toBe(false);
}
async function tap(page: Page, id: string) {
  const box = (await page.frameLocator("#view").locator("#" + id).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

describe.skipIf(process.env.MCP_BROWSER_TEST !== "true").each(["chromium", "webkit"])("mobile MCP viewport / %s", (engine) => {
  let browser: Browser;
  const pages: Page[] = [];
  beforeAll(async () => {
    browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
    bytes = (await sharp({ create: { width: 500, height: 1400, channels: 3, background: "#496079" } }).webp().toBuffer()).toString("base64");
  });
  afterEach(async () => { await Promise.all(pages.splice(0).map((page) => page.close())); });
  afterAll(async () => { await browser?.close(); });

  it.each(["standard", "chatgpt"] as const)("keeps the toolbar touchable above host chrome, at maximum zoom and after rotation: %s", async (bridge) => {
    const { page, frame, errors, requests } = await mount(browser, engine, bridge, geometry(800, 134, 24)); pages.push(page);
    await reachable(page);
    const calls = await page.evaluate(() => window.mobilePhotoHost.calls.length);
    const heights = await page.evaluate(() => window.mobilePhotoHost.heights.length);
    for (let n = 0; n < 12; n++) await tap(page, "zoom-in");
    expect(await frame.locator("#zoom").innerText()).toBe("400%"); await reachable(page);
    expect(await page.evaluate(() => window.mobilePhotoHost.calls.length)).toBe(calls);
    expect(await page.evaluate(() => window.mobilePhotoHost.heights.length)).toBe(heights);
    await tap(page, "zoom-fit"); expect(await frame.locator("#zoom").innerText()).toBe("100%");
    await page.setViewportSize({ width: 740, height: 320 });
    await page.evaluate((value) => window.mobilePhotoHost.update(value), geometry(320, 80, 0, 32));
    await expect.poll(() => frame.locator("#viewer").evaluate((node) => node.getBoundingClientRect().height)).toBe(320);
    await reachable(page); await tap(page, "zoom-out"); expect(await frame.locator("#zoom").innerText()).toBe("75%");
    await tap(page, "viewer-next"); await frame.locator("#evidence:not([hidden])").waitFor();
    expect(await frame.locator("#viewer-counter").innerText()).toBe("2 / 2"); expect(await frame.locator("#zoom").innerText()).toBe("100%");
    await tap(page, "close"); expect(await frame.locator("#viewer").getAttribute("open")).toBeNull();
    expect(await frame.locator("#counter").innerText()).toBe("2 / 2");
    expect(requests).toEqual([]); expect(errors).toEqual([]);
  }, 20_000);

  it("reserves controls on a small screen even with long metadata and a shrinking host", async () => {
    const { page, frame, errors } = await mount(browser, engine, "standard", geometry(500, 100, 16), true); pages.push(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate((value) => window.mobilePhotoHost.update(value), geometry(500, 100, 16)); await reachable(page);
    expect(await frame.locator("#viewer-company").textContent()).toContain("합성 납품업체");
    expect(await frame.locator("#viewer-caption").textContent()).toContain("2026-10-08 16:00");
    await page.evaluate((value) => window.mobilePhotoHost.update(value), geometry(330, 80, 0));
    await expect.poll(() => frame.locator("#viewer").evaluate((node) => node.getBoundingClientRect().height)).toBe(330);
    await reachable(page); await tap(page, "zoom-in"); expect(await frame.locator("#zoom").innerText()).toBe("125%");
    await tap(page, "close"); expect(await frame.locator("#viewer").getAttribute("open")).toBeNull(); expect(errors).toEqual([]);
  });

  it("adapts to VisualViewport height/offset changes without scrolling or height feedback", async () => {
    const { page, frame } = await mount(browser, engine, "standard", geometry(800, 60)); pages.push(page);
    const heights = await page.evaluate(() => window.mobilePhotoHost.heights.length);
    await frame.locator("body").evaluate(() => {
      const visual = window.visualViewport!;
      Object.defineProperty(visual, "height", { configurable: true, value: 500 });
      Object.defineProperty(visual, "offsetTop", { configurable: true, value: 36 });
      visual.dispatchEvent(new Event("resize")); visual.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => frame.locator("#viewer").evaluate((node) => node.getBoundingClientRect().height)).toBe(500);
    expect(await frame.locator("#viewer").evaluate((node) => node.getBoundingClientRect().top)).toBe(36);
    await tap(page, "zoom-in"); expect(await frame.locator("#zoom").innerText()).toBe("125%");
    expect(await frame.locator(".toolbar").evaluate((node) => node.getBoundingClientRect().bottom)).toBeLessThan(536 - 60);
    expect(await page.evaluate(() => window.mobilePhotoHost.heights.length)).toBe(heights);
  });

  it.skipIf(engine !== "chromium")("combines CSS safe area with host insets without adding them twice, and supports pinch/pan/swipe", async () => {
    const { page, frame, errors } = await mount(browser, engine, "standard", geometry(800, 80)); pages.push(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34 } });
    await reachable(page);
    const footer = await frame.locator(".viewer-controls").boundingBox();
    expect(footer!.y + footer!.height).toBeGreaterThan(800 - 80 - 20);
    const box = (await frame.locator("#viewport").boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    const touches = (gap: number) => [{ x: x - gap, y, id: 1 }, { x: x + gap, y, id: 2 }];
    const calls = await page.evaluate(() => window.mobilePhotoHost.calls.length);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touches(35) });
    for (let gap = 45; gap <= 105; gap += 15) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touches(gap) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(parseInt(await frame.locator("#zoom").innerText())).toBeGreaterThan(200);
    expect(await frame.locator("#viewer-counter").innerText()).toBe("1 / 2");
    const before = await frame.locator("#viewport").evaluate((node) => node.scrollTop);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 40, y: y - 60, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(await frame.locator("#viewport").evaluate((node) => node.scrollTop)).toBeGreaterThan(before + 40);
    expect(await page.evaluate(() => window.mobilePhotoHost.calls.length)).toBe(calls);
    await reachable(page); await tap(page, "zoom-fit");
    await expect.poll(() => frame.locator("#zoom").innerText()).toBe("100%");
    await reachable(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x + 70, y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 70, y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => frame.locator("#viewer-counter").innerText()).toBe("2 / 2");
    expect(await frame.locator("#viewer").getAttribute("open")).not.toBeNull(); expect(errors).toEqual([]);
  }, 15_000);
});
