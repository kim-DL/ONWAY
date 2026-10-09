import { afterEach, describe, expect, it } from "vitest";
import { chromium, webkit, expect as browserExpect, type Browser } from "@playwright/test";
import { CUSTOMER_VIEW_HTML } from "../../src/mcp/customer-view.js";
const browsers: Browser[] = [];
afterEach(async () => { await Promise.all(browsers.splice(0).map((browser) => browser.close())); });
const address = "합성시 예시로 1, 정문 옆(문 앞)";
const reply = { structuredContent: { status: "ok", resolution: "resolved", retrievedAt: "2026-10-08T03:59:00Z", sectionsIncluded: ["addresses", "contacts", "delivery", "notes"],
  customer: { customerId: "never-show-customer-id", name: "합성 거래처", status: "active", updatedAt: "2026-10-08T03:00:00Z",
    addresses: { deliveryAddress: address, officialAddress: "합성 공식주소", preferredAddress: address, preferredAddressSource: "delivery" },
    contacts: [{ name: "합성 담당", role: "납품 담당", phoneNumber: "010-1234-5678", isPrimary: true }],
    delivery: { locationDescription: "<img src=x onerror=alert(1)>\n원문 안내", accessPasswordState: "registered", accessPasswordIncluded: false, accessPassword: null },
    notes: { noticeType: "changed", changeNote: "<script>alert(1)</script>" } } } };
async function mount(engine: typeof chromium, compatibility = false) {
  const browser = await engine.launch({ headless: true }); browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 320, height: 540 } });
  const network: string[] = [], errors: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("http")) network.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<iframe id="view" style="width:100%;height:490px;border:0"></iframe>');
  const html = compatibility ? CUSTOMER_VIEW_HTML.replace('<script>(()=>{', '<script>window.openai={toolOutput:'
    + JSON.stringify(reply.structuredContent).replace(/</g, '\\u003c') + '};</script><script>(()=>{') : CUSTOMER_VIEW_HTML;
  await page.evaluate(({ html, reply, compatibility }) => {
    const iframe = document.querySelector<HTMLIFrameElement>("#view")!;
    const state = { calls: 0, initialized: false, heights: [] as number[], send: (method: string, params: unknown) =>
      iframe.contentWindow!.postMessage({ jsonrpc: "2.0", method, params }, "*") };
    Object.assign(window, { customerTest: state });
    addEventListener("message", (event) => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (message.method === "ui/initialize") iframe.contentWindow!.postMessage({ jsonrpc: "2.0", id: message.id, result: { hostContext: { containerDimensions: { maxHeight: 490 }, safeAreaInsets: { bottom: 40 } } } }, "*");
      if (message.method === "ui/notifications/initialized") { state.initialized = true; if (!compatibility) state.send("ui/notifications/tool-result", reply); }
      if (message.method === "tools/call") state.calls++;
      if (message.method === "ui/notifications/size-changed") state.heights.push(message.params.height);
    });
    iframe.srcdoc = html;
  }, { html, reply, compatibility });
  const frame = page.frameLocator("#view"); await browserExpect(frame.locator("#name")).toHaveText("합성 거래처");
  return { page, frame, network, errors };
}
for (const engine of [chromium, webkit]) describe.skipIf(process.env.MCP_BROWSER_TEST !== "true")(`Customer details card / ${engine.name()}`, () => {
  it("renders exact source address, phone and notes without data calls or markup execution, and fits a small host", async () => {
    const { page, frame, network, errors } = await mount(engine);
    expect(await frame.locator("#delivery-address").textContent()).toBe(address);
    expect(await frame.locator("#delivery-instructions").textContent()).toBe(reply.structuredContent.customer.delivery.locationDescription);
    expect(await frame.locator("#details").innerText()).toContain("010-1234-5678");
    expect(await frame.locator("#details img").count()).toBe(0);
    expect(await frame.locator("#details script").count()).toBe(0);
    expect(await frame.locator("body").innerText()).not.toContain("never-show-customer-id");
    expect(await frame.locator("#door-information").innerText()).toContain("등록됨");
    expect(await frame.locator("#updated").innerText()).toContain("2026-10-08 12:00");
    expect(await frame.locator("#retrieved").innerText()).toContain("12:59");
    expect(await frame.locator("main").evaluate((node) => node.getBoundingClientRect().height)).toBeLessThanOrEqual(426);
    await page.setViewportSize({ width: 640, height: 320 });
    await page.evaluate(() => (window as unknown as { customerTest: { send: (m: string, p: unknown) => void } }).customerTest.send("ui/notifications/host-context-changed", { containerDimensions: { maxHeight: 280 }, safeAreaInsets: { bottom: 40 } }));
    await browserExpect(frame.locator("main")).toHaveCSS("max-height", "216px");
    expect(await page.evaluate(() => (window as unknown as { customerTest: { calls: number } }).customerTest.calls)).toBe(0);
    expect(network).toEqual([]); expect(errors).toEqual([]);
  });
  it("uses ChatGPT toolOutput without private metadata duplication and applies new globals without reverting to old data", async () => {
    const { frame, page, network, errors } = await mount(engine, true);
    expect(await frame.locator("#delivery-address").textContent()).toBe(address);
    expect(await frame.locator("#delivery-instructions").textContent()).toBe(reply.structuredContent.customer.delivery.locationDescription);
    const next = { ...reply.structuredContent, customer: { ...reply.structuredContent.customer, name: "새 합성 거래처", status: "closed" } };
    await frame.locator("body").evaluate((_node, value) => dispatchEvent(new CustomEvent("openai:set_globals", { detail: { globals: { toolOutput: value } } })), next);
    await browserExpect(frame.locator("#name")).toHaveText("새 합성 거래처");
    expect(await frame.locator("#state").innerText()).toContain("폐업");
    expect(await page.evaluate(() => (window as unknown as { customerTest: { heights: number[] } }).customerTest.heights.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { customerTest: { calls: number } }).customerTest.calls)).toBe(0);
    expect(network).toEqual([]); expect(errors).toEqual([]);
  });
  it("shows candidate match evidence as inert text without IDs or extra calls", async () => {
    const { page, frame, network, errors } = await mount(engine);
    await page.evaluate(() => (window as unknown as { customerTest: { send: (m: string, p: unknown) => void } }).customerTest.send("ui/notifications/tool-result", {
      structuredContent: { status: "ok", resolution: "ambiguous", sectionsIncluded: [], customer: null, note: "후보 확인",
        candidates: [{ customerId: "never-show-customer-id", name: "다람종합유통", district: "합성구", administrativeDong: "합성동", status: "active",
          match: { matchType: "prefix", matchedField: "name", matchedValue: "다람종합유통", blockedReason: null } },
        { customerId: "never-show-alias-id", name: "다람식품", status: "closed",
          match: { matchType: "initials", matchedField: "aliases", matchedValue: "<img src=x onerror=alert(1)>", blockedReason: "weak_match" } }] } }));
    await browserExpect(frame.locator("#details")).toContainText("등록명 · 앞부분 일치");
    await browserExpect(frame.locator("#details")).toContainText("저장된 별칭 · 초성 일치");
    expect(await frame.locator("#details").innerText()).toContain("합성구 합성동");
    expect(await frame.locator("#details").innerText()).toContain("약한 부분 일치");
    expect(await frame.locator("#details").innerText()).toContain("폐업");
    expect(await frame.locator("#details").innerText()).toContain("<img src=x onerror=alert(1)>");
    expect(await frame.locator("#details img").count()).toBe(0);
    expect(await frame.locator("body").innerText()).not.toContain("never-show");
    expect(await frame.locator("body").innerText()).not.toContain(address);
    expect(await page.evaluate(() => (window as unknown as { customerTest: { calls: number } }).customerTest.calls)).toBe(0);
    expect(network).toEqual([]); expect(errors).toEqual([]);
  });
  it("clears old private values for unresolved/cancelled/error results and omits sections that were not requested", async () => {
    const { page, frame } = await mount(engine);
    const send = (method: string, params: unknown) => page.evaluate(({ method, params }) =>
      (window as unknown as { customerTest: { send: (m: string, p: unknown) => void } }).customerTest.send(method, params), { method, params });
    await send("ui/notifications/tool-result", { structuredContent: { ...reply.structuredContent, customer: { ...reply.structuredContent.customer, contacts: null, delivery: null, notes: null } } });
    await browserExpect(frame.locator("#details")).not.toContainText("010-1234-5678");
    await send("ui/notifications/tool-result", { structuredContent: { status: "ok", resolution: "ambiguous", customer: null, sectionsIncluded: [], note: "후보를 확인해주세요." } });
    await browserExpect(frame.locator("#details")).toBeEmpty(); await browserExpect(frame.locator("#status")).toHaveText("후보를 확인해주세요.");
    await send("ui/notifications/tool-result", reply); await browserExpect(frame.locator("#name")).toHaveText("합성 거래처");
    await send("ui/notifications/tool-cancelled", {}); await browserExpect(frame.locator("#details")).toBeEmpty();
    await send("ui/notifications/tool-result", { isError: true, content: [], _meta: { error: { code: "FORBIDDEN" } } });
    await browserExpect(frame.locator("#status")).toContainText("표시하지 못했습니다");
    expect(await frame.locator("body").innerText()).not.toContain(address);
  });
});
