import { chromium, webkit, expect as expectBrowser, type Browser, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { INVENTORY_WRITE_VIEW_HTML } from "../../src/mcp/inventory-write-view.js";

for (const engine of ["chromium", "webkit"] as const) describe.skipIf(process.env.MCP_BROWSER_TEST !== "true")(`inventory approval UI / ${engine}`, () => {
  let browser: Browser; const pages: Page[] = [];
  beforeAll(async () => { browser = await ({ chromium, webkit }[engine]).launch({ headless: true }); });
  afterEach(async () => { await Promise.all(pages.splice(0).map((p) => p.close())); });
  afterAll(async () => { await browser?.close(); });
  async function mount(height = 500, width = 390, expired = false) {
    const page = await browser.newPage({ viewport: { width, height }, timezoneId: "America/Los_Angeles" }); pages.push(page);
    const network: string[] = [], errors: string[] = [];
    page.on("request", (r) => { if (/^https?:/.test(r.url())) network.push(r.url()); }); page.on("pageerror", (e) => errors.push(e.message));
    await page.setContent('<style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><iframe sandbox="allow-scripts"></iframe>');
    await page.evaluate(({ html, expired }) => {
      const frame = document.querySelector('iframe')!;
      const send = (value: unknown) => frame.contentWindow!.postMessage(value, '*');
      const state = { calls: [] as unknown[], hold: true, result: { structuredContent: { state: 'committed', note: '저장했습니다.', registeredAt: new Date().toISOString() } } };
      (window as unknown as { approvalTest: typeof state }).approvalTest = state;
      window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow) return;
        const m = event.data;
        if (m.method === 'ui/initialize') send({ jsonrpc:'2.0', id:m.id, result:{protocolVersion:'2026-01-26',hostCapabilities:{serverTools:{}},hostContext:{}} });
        if (m.method === 'ui/notifications/initialized') send({ jsonrpc:'2.0', method:'ui/notifications/tool-result', params: {
          structuredContent: { status:'ok',state:'awaiting_approval',planId:'a0b82772-0457-4b3e-8e85-9e4c97a8dcac',productName:'<img src=x onerror=alert(1)> 합성 상품',action:'count_match',
            unitLabel:'봉',locationId:'freezer1',validUntil:new Date(Date.now()+(expired?-1000:300000)).toISOString(),canWrite:true,
            before:{refrigerated:0,freezer1:19,freezer2:0,sample:0},after:{refrigerated:0,freezer1:19,freezer2:0,sample:0},reason:'합성 검증',
            lines:Array.from({length:30},()=>({locationId:'freezer1',lotLabel:'합성 묶음',expiryDate:'2026-12-31',before:19,after:19})) },
          _meta:{ inventoryApproval:{ planId:'a0b82772-0457-4b3e-8e85-9e4c97a8dcac', approvalToken:'a'.repeat(43) } } } });
        if (m.method === 'tools/call') { state.calls.push(m); if (!state.hold) send({jsonrpc:'2.0',id:m.id,result:state.result}); }
        if (m.method === 'ui/update-model-context') send({jsonrpc:'2.0',id:m.id,result:{}});
      });
      frame.srcdoc=html;
    }, { html: INVENTORY_WRITE_VIEW_HTML, expired });
    const frame = page.frameLocator('iframe'); await frame.locator('#confirmation:not([hidden])').waitFor();
    return { page, frame, network, errors };
  }
  it("requires trusted human confirmation, keeps controls visible and sends only the stored approval once", async () => {
    for (const [width, height] of [[320, 480], [667, 320]]) {
      const { page, frame, network, errors } = await mount(height, width);
      expect(await frame.locator('img').count()).toBe(0); expect(await frame.locator('body').innerText()).not.toContain('aaaaaaa');
      await expectBrowser(frame.locator('#approve')).toBeDisabled();
      await frame.locator('#checked').check(); await expectBrowser(frame.locator('#approve')).toBeEnabled();
      const box = await frame.locator('#approve').boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      await frame.locator('#approve').evaluate((button) => (button as HTMLButtonElement).click());
      expect(await page.evaluate(() => (window as unknown as {approvalTest:{calls:unknown[]}}).approvalTest.calls.length)).toBe(0);
      await frame.locator('#approve').click(); await expectBrowser(frame.locator('#approve')).toBeDisabled();
      await page.waitForFunction(() => (window as unknown as {approvalTest:{calls:unknown[]}}).approvalTest.calls.length === 1);
      const calls = await page.evaluate(() => (window as unknown as {approvalTest:{calls:Array<{params:unknown}>}}).approvalTest.calls);
      expect(calls).toHaveLength(1); expect(calls[0]!.params).toEqual({ name:'commit_inventory_change',arguments:{planId:'a0b82772-0457-4b3e-8e85-9e4c97a8dcac',approvalToken:'a'.repeat(43)} });
      expect(network).toEqual([]); expect(errors).toEqual([]);
    }
  });
  it("renders a verified commit and prevents further submission; expired previews cannot be approved", async () => {
    const {page,frame}=await mount();
    await page.evaluate(()=>{(window as unknown as {approvalTest:{hold:boolean}}).approvalTest.hold=false;});
    await frame.locator('#checked').check();await frame.locator('#approve').click();
    await expectBrowser(frame.locator('#title')).toHaveText('재고 저장 완료');await expectBrowser(frame.locator('#approve')).toBeHidden();
    const old=await mount(480,320,true);await old.frame.locator('#checked').check();await expectBrowser(old.frame.locator('#approve')).toBeDisabled();
  });
});
