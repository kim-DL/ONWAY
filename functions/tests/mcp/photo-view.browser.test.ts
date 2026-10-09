import { chromium, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PHOTO_VIEW_HTML } from "../../src/mcp/photo-view.js";

type Photo = { createdByEmployeeId?: string; customerId: string; customerName: string | null; photoId: string; variant: string; mimeType: string; data: string; createdAt: string; createdByName: string };
type Cursor = { photoId: string; createdAt: string };
type Gallery = { employeeId?: string | null; employeeName?: string; customerId: string; customerName: string | null; date: string | null; photos: Array<Pick<Photo, "photoId" | "createdAt" | "createdByName">>; after: Cursor | null; nextCursor: Cursor | null };
type Result = { _meta?: { error?: { code: string }; deliveryPhoto?: Photo; deliveryGallery?: Gallery; deliveryNotice?: { message: string } }; content?: Array<{ type: string; text: string }>; isError?: boolean; structuredContent?: { error: { code: string } } };
type Message = { id: string; method: string; params: Record<string, unknown> };
declare global { interface Window { photoTest: { calls: Message[]; held: Message[]; hold: boolean; photos: Photo[] | null; result: Result; modes: string[]; heights: number[]; reply: (message: Message) => void } } }
const photoId = "c3bc6631-22fb-4f14-b622-bb852652c891";
const otherId = "15695901-4704-49ce-adc1-9a8c2f5f29f6";
let browser: Browser, thumbnail: Photo, evidence: Photo;
const pages: Page[] = [];
async function mount(options: { mobile?: boolean; compatibility?: boolean; hold?: boolean; fullscreen?: boolean } = {}) {
  const page = await browser.newPage({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, timezoneId: "America/Los_Angeles" });
  pages.push(page); page.setDefaultTimeout(5000);
  const requests: string[] = [], errors: string[] = [];
  page.on("request", (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<style>body{margin:0}iframe{display:block;width:100%;height:620px;border:0}</style><iframe id="view" sandbox="allow-scripts"></iframe>');
  await page.evaluate(({ html, result, compatibility, hold, fullscreen }) => {
    const frame = document.querySelector<HTMLIFrameElement>("#view")!;
    const send = (message: unknown) => frame.contentWindow!.postMessage(message, "*");
    const state = window.photoTest = { calls: [] as Message[], held: [] as Message[], hold: !!hold, photos: null as Photo[] | null, result, modes: [] as string[], heights: [] as number[],
      reply: (message: Message) => {
        const args = message.params.arguments as { photoId?: string; variant?: string };
        const match = message.params.name === "get_delivery_photo" && state.photos?.find((photo) => photo.photoId === args.photoId && photo.variant === args.variant);
        send({ jsonrpc: "2.0", id: message.id, result: match ? { _meta: { deliveryPhoto: match } } : state.result });
      } };
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      const message = event.data as Message;
      if (message.method === "ui/initialize" && !compatibility) send({ jsonrpc: "2.0", id: message.id, result: {
        protocolVersion: "2026-01-26", hostInfo: { name: "synthetic-host", version: "1" }, hostCapabilities: { serverTools: {} },
        hostContext: { displayMode: "inline", availableDisplayModes: fullscreen === false ? ["inline"] : ["inline", "fullscreen"] },
      } });
      if (message.method === "tools/call") {
        state.calls.push(message);
        if (state.hold) state.held.push(message); else state.reply(message);
      }
      if (message.method === "ui/request-display-mode") {
        const mode = message.params.mode as string; state.modes.push(mode);
        frame.style.height = mode === "fullscreen" ? window.innerHeight + "px" : (state.heights.at(-1) ?? 620) + "px";
        send({ jsonrpc: "2.0", id: message.id, result: { mode } });
      }
      if (message.method === "ui/notifications/size-changed") state.heights.push(message.params.height as number);
    });
    frame.srcdoc = html;
  }, { html: PHOTO_VIEW_HTML, result: { _meta: { deliveryPhoto: evidence } }, ...options });
  const frame = page.frameLocator("#view");
  await frame.locator("#status").waitFor();
  if (!options.compatibility) await page.waitForFunction(() => window.photoTest.heights.length > 0);
  return { page, frame, requests, errors };
}
async function deliver(page: Page, result: Result) {
  await page.evaluate((params) => document.querySelector<HTMLIFrameElement>("#view")!.contentWindow!.postMessage({
    jsonrpc: "2.0", method: "ui/notifications/tool-result", params,
  }, "*"), result);
}
async function ready(page: Page, photo = thumbnail) {
  await deliver(page, { _meta: { deliveryPhoto: photo } });
  await page.frameLocator("#view").locator("#card:not([hidden])").waitFor();
}

describe.skipIf(process.env.MCP_BROWSER_TEST !== "true")("MCP photo card and evidence viewer", () => {
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const bytes = async (size: number) => (await sharp({ create: { width: size, height: size, channels: 3, background: "#123456" } }).webp().toBuffer()).toString("base64");
    thumbnail = { createdByEmployeeId: "employee-a", customerId: "synthetic-company", customerName: "합성 납품업체", photoId, variant: "thumbnail", mimeType: "image/webp", data: await bytes(40), createdAt: "2026-10-07T03:56:00.000Z", createdByName: "합성 직원 차장" };
    evidence = { ...thumbnail, variant: "evidence", data: await bytes(800) };
  });
  afterEach(async () => { await Promise.all(pages.splice(0).map((page) => page.close())); });
  afterAll(async () => { await browser?.close(); });

  it("shows Seoul metadata, opens only the same authenticated evidence, and closes by button, ESC and backdrop", async () => {
    const { page, frame, requests, errors } = await mount();
    await ready(page);
    expect(await frame.locator("#caption").innerText()).toBe("2026-10-07 12:56 · 합성 직원 차장");
    expect(await frame.locator("#company").innerText()).toBe("납품업체 · 합성 납품업체");
    expect(await frame.locator("body").innerText()).not.toMatch(/c3bc6631|data:image|https?:/);
    for (const close of ["button", "escape", "backdrop"]) {
      await frame.getByRole("button", { name: "사진 크게 보기", exact: true }).click();
      await frame.locator("#evidence:not([hidden])").waitFor();
      expect(await frame.locator("#evidence").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(800);
      expect(await frame.locator("#viewer-caption").innerText()).toBe(await frame.locator("#caption").innerText());
      // Native dialog keeps Tab in the modal, and the thumbnail returns to focus on closing.
      await page.keyboard.press("Tab");
      expect(await frame.locator("#viewer").evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
      if (close === "button") await frame.getByRole("button", { name: "사진 뷰어 닫기" }).click();
      if (close === "escape") await page.keyboard.press("Escape");
      if (close === "backdrop") await frame.locator("#viewer").click({ position: { x: 4, y: 4 } });
      await frame.locator("#viewer[open]").waitFor({ state: "detached" });
      expect(await frame.locator("#evidence").getAttribute("src")).toBeNull();
      expect(await frame.locator("#open").evaluate((button) => button === document.activeElement)).toBe(true);
    }
    const calls = await page.evaluate(() => window.photoTest.calls.map(({ method, params }) => ({ method, params })));
    expect(calls).toEqual(Array.from({ length: 3 }, () => ({ method: "tools/call", params: { name: "get_delivery_photo", arguments: { photoId, variant: "evidence" } } })));
    expect(await page.evaluate(() => window.photoTest.modes.filter((mode) => mode === "fullscreen"))).toHaveLength(3);
    expect(Math.max(...await page.evaluate(() => window.photoTest.heights))).toBeLessThan(720);
    expect(requests).toEqual([]); expect(errors).toEqual([]);
  });

  it("uses the full mobile width without overflow and returns when the host leaves fullscreen", async () => {
    const { page, frame } = await mount({ mobile: true }); await ready(page);
    await frame.locator("#open").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    const dimensions = await frame.locator(".panel").evaluate((panel) => ({ width: panel.getBoundingClientRect().width, viewport: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth, close: document.getElementById("close")!.getBoundingClientRect().height }));
    expect(dimensions).toEqual({ width: 390, viewport: 390, overflow: false, close: 44 });
    // The mobile panel fills the viewport; its empty background must still dismiss the viewer.
    await frame.locator(".panel").click({ position: { x: 4, y: 800 } });
    await frame.locator("#viewer[open]").waitFor({ state: "detached" });
    await frame.locator("#open").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    await page.evaluate(() => document.querySelector<HTMLIFrameElement>("#view")!.contentWindow!.postMessage({ jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed", params: { displayMode: "inline" } }, "*"));
    await frame.locator("#viewer[open]").waitFor({ state: "detached" });
  });

  it("ignores forged messages, keeps names as text, and clears bytes on teardown", async () => {
    const { page, frame, requests } = await mount();
    await frame.locator("body").evaluate((_body, photo) => window.dispatchEvent(new MessageEvent("message", {
      data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { _meta: { deliveryPhoto: photo } } }, source: null,
    })), thumbnail);
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    await ready(page, { ...thumbnail, createdAt: "2026-10-07T15:00:00Z", createdByName: '<img src="https://invalid.test" onerror="alert(1)">' });
    expect(await frame.locator("#caption").innerText()).toBe('2026-10-08 00:00 · <img src="https://invalid.test" onerror="alert(1)">');
    expect(await frame.locator("#caption img").count()).toBe(0);
    await page.evaluate(() => document.querySelector<HTMLIFrameElement>("#view")!.contentWindow!.postMessage({ jsonrpc: "2.0", id: "teardown", method: "ui/resource-teardown" }, "*"));
    await frame.locator("#card[hidden]").waitFor({ state: "attached" });
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    expect(requests).toEqual([]);
  });

  it("discards late results after closing or changing photo and ignores evidence notification echoes", async () => {
    const { page, frame } = await mount({ hold: true }); await ready(page);
    await frame.locator("#open").click(); await page.waitForFunction(() => window.photoTest.held.length === 1);
    await frame.locator("#close").click();
    await page.evaluate(() => window.photoTest.reply(window.photoTest.held.shift()!));
    await deliver(page, { _meta: { deliveryPhoto: evidence } });
    expect(await frame.locator("#viewer").getAttribute("open")).toBeNull();
    expect(await frame.locator("#photo").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(40);
    await frame.locator("#open").click(); await page.waitForFunction(() => window.photoTest.held.length === 1);
    await ready(page, { ...thumbnail, photoId: otherId, createdByName: "다른 합성 직원" });
    await page.evaluate(() => window.photoTest.reply(window.photoTest.held.shift()!));
    await deliver(page, { _meta: { deliveryPhoto: evidence } });
    expect(await frame.locator("#viewer").getAttribute("open")).toBeNull();
    expect(await frame.locator("#caption").innerText()).toContain("다른 합성 직원");
    expect(await frame.locator("#evidence").getAttribute("src")).toBeNull();
  });

  it("safely retries failures, rejects a different photo and clears revoked/expired images", async () => {
    const { page, frame, errors } = await mount({ fullscreen: false }); await ready(page);
    await page.evaluate((photo) => { window.photoTest.result = { _meta: { deliveryPhoto: photo } }; }, { ...evidence, photoId: otherId });
    await frame.locator("#open").click(); await frame.locator("#retry:not([hidden])").waitFor();
    expect(await frame.locator("#evidence").getAttribute("src")).toBeNull();
    await page.evaluate((photo) => { window.photoTest.result = { _meta: { deliveryPhoto: photo } }; }, evidence);
    await frame.locator("#retry").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    await frame.locator("#close").click();
    await page.evaluate(() => { window.photoTest.result = { isError: true, _meta: { error: { code: "NOT_FOUND" } } }; });
    await frame.locator("#open").click(); await frame.locator("#card[hidden]").waitFor({ state: "attached" });
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    expect(await frame.locator("#evidence").getAttribute("src")).toBeNull();
    expect(await frame.locator("#status").innerText()).toContain("만료");
    expect(errors).toEqual([]);
  });

  async function galleryReady(page: Page, options: { nextCursor?: Cursor; empty?: boolean } = {}) {
    const second = { ...thumbnail, photoId: otherId, createdAt: "2026-10-07T05:30:00Z", createdByName: "다른 합성 직원" };
    await page.evaluate((photos) => { window.photoTest.photos = photos; }, [thumbnail, evidence, second, { ...second, variant: "evidence", data: evidence.data }]);
    const group: Gallery = { customerId: thumbnail.customerId, customerName: thumbnail.customerName, date: "2026-10-07",
      photos: options.empty ? [] : [thumbnail, second].map(({ photoId, createdAt, createdByName }) => ({ photoId, createdAt, createdByName })),
      after: null, nextCursor: options.nextCursor ?? null };
    await deliver(page, { _meta: { deliveryGallery: group } });
    if (!options.empty) await page.frameLocator("#view").locator("#photo:not([hidden])").waitFor();
    return group;
  }

  it("shows several photos in one gallery, loads only the selection and zooms/pans without another request", async () => {
    const { page, frame, requests, errors } = await mount(); await galleryReady(page);
    expect(await frame.locator("#counter").innerText()).toBe("1 / 2");
    expect(await page.evaluate(() => window.photoTest.calls.length)).toBe(1);
    await frame.locator("#next").click(); await frame.locator("#photo:not([hidden])").waitFor();
    expect(await frame.locator("#counter").innerText()).toBe("2 / 2");
    expect(await frame.locator("#caption").innerText()).toBe("2026-10-07 14:30 · 다른 합성 직원");
    await frame.locator("#open").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    expect(await frame.locator("#viewer-company").innerText()).toBe("납품업체 · 합성 납품업체");
    const fitted = await frame.locator("#evidence").boundingBox();
    for (let i = 0; i < 12; i++) await frame.locator("#zoom-in").click();
    expect(await frame.locator("#zoom").innerText()).toBe("400%");
    expect(await frame.locator("#zoom-in").isDisabled()).toBe(true);
    const zoomed = await frame.locator("#evidence").boundingBox();
    expect(zoomed!.width).toBeGreaterThan(fitted!.width * 3.8);
    const viewport = await frame.locator("#viewport").boundingBox();
    const before = await frame.locator("#viewport").evaluate((node) => ({ x: node.scrollLeft, y: node.scrollTop }));
    await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + viewport!.height / 2);
    await page.mouse.down(); await page.mouse.move(viewport!.x + viewport!.width / 2 - 75, viewport!.y + viewport!.height / 2 - 70, { steps: 5 }); await page.mouse.up();
    const after = await frame.locator("#viewport").evaluate((node) => ({ x: node.scrollLeft, y: node.scrollTop }));
    expect(after.x - before.x).toBeGreaterThan(60); expect(after.y - before.y).toBeGreaterThan(60);
    expect(await frame.locator("#viewer-counter").innerText()).toBe("2 / 2");
    await frame.locator("#zoom-fit").click();
    expect(await frame.locator("#zoom").innerText()).toBe("100%");
    await frame.locator("#zoom-out").click(); await frame.locator("#zoom-out").click();
    expect(await frame.locator("#zoom").innerText()).toBe("50%"); expect(await frame.locator("#zoom-out").isDisabled()).toBe(true);
    expect(await page.evaluate(() => window.photoTest.calls.length)).toBe(3);
    await frame.locator("#viewer-prev").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    expect(await frame.locator("#zoom").innerText()).toBe("100%");
    expect(await frame.locator("#viewer-caption").innerText()).toContain("12:56");
    await frame.locator("#close").click(); await frame.locator("#photo:not([hidden])").waitFor();
    expect(await frame.locator("#counter").innerText()).toBe("1 / 2");
    expect(requests).toEqual([]); expect(errors).toEqual([]);
  });

  it("swipes a mobile gallery without opening it and fits a portrait with reachable controls", async () => {
    const { page, frame } = await mount({ mobile: true }); await galleryReady(page);
    const image = await frame.locator("#open").boundingBox();
    // Trusted touch events exercise Chromium's touch-action and pointer cancellation behavior.
    const cdp = await page.context().newCDPSession(page);
    const x = image!.x + image!.width * .8, y = image!.y + image!.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * 30, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await frame.locator("#photo:not([hidden])").waitFor();
    expect(await frame.locator("#counter").innerText()).toBe("2 / 2");
    expect(await frame.locator("#viewer").getAttribute("open")).toBeNull();
    const portrait = (await sharp({ create: { width: 600, height: 1600, channels: 3, background: "#365678" } }).webp().toBuffer()).toString("base64");
    await page.evaluate((data) => { window.photoTest.photos!.filter((photo) => photo.variant === "evidence").forEach((photo) => { photo.data = data; }); }, portrait);
    await page.waitForTimeout(420); // Suppression window for the swipe's synthetic click.
    await frame.locator("#open").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    const dimensions = await frame.locator(".panel").evaluate((panel) => ({ width: panel.getBoundingClientRect().width,
      overflow: panel.scrollHeight > panel.clientHeight, buttonBottom: document.getElementById("viewer-next")!.getBoundingClientRect().bottom,
      imageBottom: document.getElementById("evidence")!.getBoundingClientRect().bottom, areaBottom: document.getElementById("viewport")!.getBoundingClientRect().bottom }));
    expect(dimensions.width).toBe(390); expect(dimensions.overflow).toBe(false);
    expect(dimensions.buttonBottom).toBeLessThanOrEqual(844); expect(dimensions.imageBottom).toBeLessThanOrEqual(dimensions.areaBottom + 1);
  });

  it("continues pages inside the same gallery, handles empty partial pages and rejects a non-advancing cursor", async () => {
    const { page, frame } = await mount();
    const cursor = { photoId, createdAt: thumbnail.createdAt };
    const group = await galleryReady(page, { empty: true, nextCursor: cursor });
    expect(await frame.locator("#status").innerText()).toContain("계속 확인");
    const pageResult: Result = { _meta: { deliveryGallery: { ...group, after: cursor, nextCursor: cursor } } };
    await page.evaluate((result) => { window.photoTest.result = result; }, pageResult);
    await frame.locator("#more").click();
    await page.waitForFunction(() => window.photoTest.calls.length === 1);
    await frame.locator("#more:not([disabled])").waitFor();
    expect(await frame.locator("#status").innerText()).toContain("다시 시도");
    pageResult._meta!.deliveryGallery!.photos = [thumbnail, { ...thumbnail, photoId: otherId }, thumbnail];
    pageResult._meta!.deliveryGallery!.nextCursor = null;
    await page.evaluate((result) => { window.photoTest.result = result; }, pageResult);
    await frame.locator("#more").click(); await frame.locator("#photo:not([hidden])").waitFor();
    expect(await frame.locator("#counter").innerText()).toBe("1 / 2");
    expect(await frame.locator("#more").isHidden()).toBe(true);
    await deliver(page, pageResult); // The host echoes the UI page call, which must not reset selection.
    await frame.locator("#next").click(); await frame.locator("#photo:not([hidden])").waitFor();
    await deliver(page, pageResult);
    expect(await frame.locator("#counter").innerText()).toBe("2 / 2");
    expect(await page.evaluate(() => window.photoTest.calls[0]!.params)).toEqual({ name: "get_delivery_gallery", arguments: {
      customerId: thumbnail.customerId, date: "2026-10-07", limit: 50, after: cursor } });
  });

  it("shows a page failure visibly after hiding the evidence success announcement", async () => {
    const { page, frame } = await mount();
    await galleryReady(page, { nextCursor: { photoId: otherId, createdAt: thumbnail.createdAt } });
    await frame.locator("#open").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    await frame.locator("#viewer-next").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    await page.evaluate(() => { window.photoTest.result = { isError: true, structuredContent: { error: { code: "UNAVAILABLE" } } }; });
    await frame.locator("#viewer-next").click();
    await expect.poll(() => frame.locator("#viewer-status").textContent()).toContain("다음 사진 목록을 불러오지 못했습니다");
    expect((await frame.locator("#viewer-status").boundingBox())!.height).toBeGreaterThan(30);
    expect(await frame.locator("#evidence").isVisible()).toBe(true);
    expect(await frame.locator("#viewer-next").isEnabled()).toBe(true);
    await frame.locator("#zoom-in").click(); expect(await frame.locator("#zoom").innerText()).toBe("125%");
  });

  it("coalesces rapid navigation, discards stale pixels, permits other photos after expiry and clears all on revocation", async () => {
    const { page, frame } = await mount(); await galleryReady(page);
    await page.evaluate(() => { window.photoTest.hold = true; });
    await frame.locator("#next").click(); await page.waitForFunction(() => window.photoTest.held.length === 1);
    await frame.locator("#prev").click(); await frame.locator("#next").click(); await frame.locator("#prev").click();
    expect(await page.evaluate(() => window.photoTest.held.length)).toBe(1);
    await page.evaluate(() => window.photoTest.reply(window.photoTest.held.shift()!));
    await page.waitForFunction(() => window.photoTest.held.length === 1);
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    await page.evaluate(() => { window.photoTest.hold = false; window.photoTest.reply(window.photoTest.held.shift()!); });
    await frame.locator("#photo:not([hidden])").waitFor();
    expect(await frame.locator("#caption").innerText()).toContain("12:56");
    await page.evaluate((id) => {
      window.photoTest.photos = window.photoTest.photos!.filter((photo) => photo.photoId !== id);
      window.photoTest.result = { isError: true, structuredContent: { error: { code: "NOT_FOUND" } } };
    }, otherId);
    await frame.locator("#next").click();
    await frame.locator("#status").filter({ hasText: "보관기간" }).waitFor();
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    await frame.locator("#prev").click(); await frame.locator("#photo:not([hidden])").waitFor();
    await page.evaluate(() => { window.photoTest.photos = null; window.photoTest.result = { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "error", error: { code: "FORBIDDEN" } }) }] }; });
    await frame.locator("#open").click(); await frame.locator("#card[hidden]").waitFor({ state: "attached" });
    expect(await frame.locator("#viewer").getAttribute("open")).toBeNull();
    expect(await frame.locator("#company").isHidden()).toBe(true);
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    expect(await frame.locator("#evidence").getAttribute("src")).toBeNull();
  });

  it("displays a prefetched employee gallery with no tool calls, then keeps the employee filter on more pages", async () => {
    const { page, frame, requests, errors } = await mount();
    const after = { photoId, createdAt: thumbnail.createdAt };
    const group: Gallery = { employeeId: "employee-a", employeeName: "합성 직원", customerId: thumbnail.customerId,
      customerName: thumbnail.customerName, date: "2026-10-07", photos: [thumbnail], after: null, nextCursor: after };
    await deliver(page, { _meta: { deliveryGallery: group, deliveryPhoto: thumbnail } });
    await frame.locator("#photo:not([hidden])").waitFor();
    expect(await page.evaluate(() => window.photoTest.calls)).toEqual([]);
    expect(await frame.locator("#time-basis").innerText()).toContain("납품완료 시각");
    expect(await frame.locator("#page-note").innerText()).toContain("합성 직원");
    await page.evaluate((group) => { window.photoTest.result = { _meta: { deliveryGallery: group } }; },
      { ...group, photos: [{ ...thumbnail, photoId: otherId }], after, nextCursor: null });
    await frame.locator("#more").click();
    await frame.locator("#more").waitFor({ state: "hidden" });
    expect(await frame.locator("#counter").innerText()).toBe("1 / 2");
    expect(await page.evaluate(() => window.photoTest.calls.map((call) => call.params))).toEqual([{
      name: "get_delivery_gallery", arguments: { customerId: thumbnail.customerId, employeeId: "employee-a", date: "2026-10-07", limit: 50, after },
    }]);
    expect(requests).toEqual([]); expect(errors).toEqual([]);
  });

  it("rejects a prefetched image from another employee and an unfiltered continuation page", async () => {
    const { page, frame } = await mount();
    const after = { photoId, createdAt: thumbnail.createdAt };
    const group: Gallery = { employeeId: "employee-a", customerId: thumbnail.customerId, customerName: thumbnail.customerName,
      date: "2026-10-07", photos: [thumbnail], after: null, nextCursor: after };
    await deliver(page, { _meta: { deliveryGallery: group, deliveryPhoto: { ...thumbnail, createdByEmployeeId: "someone-else" } } });
    await frame.locator("#thumb-retry:not([hidden])").waitFor();
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    expect(await page.evaluate(() => window.photoTest.calls)).toEqual([]);
    await page.evaluate((group) => { window.photoTest.result = { _meta: { deliveryGallery: group } }; },
      { ...group, employeeId: null, photos: [{ ...thumbnail, photoId: otherId }], after, nextCursor: null });
    await frame.locator("#more").click(); await frame.locator("#more:not([disabled])").waitFor();
    expect(await frame.locator("#counter").innerText()).toBe("1 / 1+");
    expect(await frame.locator("#status").innerText()).toContain("다시 시도");
  });

  it("shows employee ambiguity/no-record notices instead of spinning forever and supports ChatGPT prefetched envelopes", async () => {
    const { frame, errors } = await mount({ compatibility: true });
    const group: Gallery = { employeeId: "employee-a", customerId: thumbnail.customerId, customerName: thumbnail.customerName,
      date: "2026-10-07", photos: [thumbnail], after: null, nextCursor: null };
    await frame.locator("body").evaluate((_body, metadata) => {
      Object.assign(window, { openai: { toolResponseMetadata: { mcp_tool_result: { _meta: metadata } },
        callTool: () => { throw new Error("No tool call should be needed for the initial image"); } } });
      window.dispatchEvent(new Event("openai:set_globals"));
    }, { deliveryGallery: group, deliveryPhoto: thumbnail });
    await frame.locator("#photo:not([hidden])").waitFor();
    await frame.locator("body").evaluate(() => {
      Object.assign(window, { openai: { toolResponseMetadata: { deliveryNotice: { message: "직원 이름이 일치하는 후보가 여러 명입니다." } } } });
      window.dispatchEvent(new Event("openai:set_globals"));
    });
    expect(await frame.locator("#status").innerText()).toContain("후보가 여러 명");
    expect(await frame.locator("#photo").getAttribute("src")).toBeNull();
    expect(await frame.locator("#card").isHidden()).toBe(true); expect(errors).toEqual([]);
  });

  it("supports ChatGPT's envelope and callTool/display-mode compatibility APIs", async () => {
    const { frame, requests, errors } = await mount({ compatibility: true });
    await frame.locator("body").evaluate((_body, { thumb, large }) => {
      Object.assign(window, { compatibilityCalls: [] as unknown[], compatibilityModes: [] as string[] });
      const calls = (window as unknown as { compatibilityCalls: unknown[] }).compatibilityCalls;
      const modes = (window as unknown as { compatibilityModes: string[] }).compatibilityModes;
      Object.assign(window, { openai: {
        toolResponseMetadata: { status: "success", mcp_tool_result: { _meta: { deliveryPhoto: thumb } } },
        callTool: async (name: string, args: unknown) => { calls.push({ name, args }); return { call_tool_result: { _meta: { deliveryPhoto: large } } }; },
        requestDisplayMode: async ({ mode }: { mode: string }) => { modes.push(mode); return { mode }; },
      } });
      window.dispatchEvent(new Event("openai:set_globals"));
    }, { thumb: thumbnail, large: evidence });
    await frame.locator("#card:not([hidden])").waitFor();
    await frame.locator("#open").click(); await frame.locator("#evidence:not([hidden])").waitFor();
    await frame.locator("#close").click();
    expect(await frame.locator("body").evaluate(() => (window as unknown as { compatibilityCalls: unknown[] }).compatibilityCalls))
      .toEqual([{ name: "get_delivery_photo", args: { photoId, variant: "evidence" } }]);
    expect(await frame.locator("body").evaluate(() => (window as unknown as { compatibilityModes: string[] }).compatibilityModes)).toContain("fullscreen");
    expect(requests).toEqual([]); expect(errors).toEqual([]);
  });
});
