import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";

let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  fixture = await buildInventoryPhotoFixture("inventory-race-entry", [{ name: "inventory-race", setup(builder) {
    builder.onResolve({ filter: /^inventory-race-entry$|inventory-repository$/ }, (args) => ({ path: args.path === "inventory-race-entry" ? "entry" : "repository", namespace: "inventory-race" }));
    builder.onLoad({ filter: /.*/, namespace: "inventory-race" }, ({ path }) => ({ loader: "tsx", resolveDir: root, contents: path === "entry" ? `
      import {createRoot} from 'react-dom/client';
      import {InventoryWorkspace} from './src/features/inventory/inventory-workspace';
      const session={uid:'inventory-race',displayName:'합성 직원',claims:{employeeId:'RACE',roleScopes:['viewer'],sessionVersion:1,permissionsVersion:1}};
      createRoot(document.getElementById('root')).render(<main className="workspace-shell"><div className="workspace-content"><InventoryWorkspace session={session}/></div></main>);
    ` : `
      import {inventoryLocationMap} from './src/domain/inventory';
      import {inventoryKoreaDate} from './src/features/inventory/inventory-calendar';
      const failedPart=new URLSearchParams(location.search).get('fail');
      const context={today:inventoryKoreaDate(),canWrite:false,canAdmin:false,settings:{urgentDays:7,weekday:1,revision:1},cycle:{cycleId:'test',startDate:'2026-01-01',nextDate:'2099-01-01',weekday:1}};
      const stale={productId:'test-item',name:'경쟁 검증 품목',manufacturer:'합성 제조사',status:'active',unitLabel:'봉',revision:1,stockRevision:1,createdAt:'2026-01-01T00:00:00Z',defaultLocationId:'freezer1',quantityByLocation:{...inventoryLocationMap(0),freezer1:1},nearestExpiryByLocation:inventoryLocationMap(null),lastCountByLocation:inventoryLocationMap(null)};
      const current={...stale,revision:2,stockRevision:2,quantityByLocation:{...stale.quantityByLocation,freezer1:9}};
      let contextCalls=0,listCalls=0;
      window.__inventoryRace={late:null,finish:null,retry:()=>window.dispatchEvent(new Event('focus'))};
      export const inventoryRepository={
        context:()=>{
          if(++contextCalls>1)return Promise.resolve(context);
          if(failedPart==='context')return Promise.reject(Error('synthetic context failure'));
          return new Promise(resolve=>{window.__inventoryRace.late=()=>resolve(context)});
        },
        list:onProgress=>{
          if(++listCalls>1){onProgress([current],{pageCount:1,complete:false});return new Promise(resolve=>{window.__inventoryRace.finish=()=>resolve([current])});}
          if(failedPart==='list'){onProgress([stale],{pageCount:1,complete:false});return Promise.reject(Error('synthetic list failure'));}
          return new Promise(resolve=>{window.__inventoryRace.late=()=>{onProgress([stale],{pageCount:1,complete:true});resolve([stale])}});
        }
      };
      export const inventoryErrorMessage=()=> '합성 조회 실패';
    ` }));
  } }]);
});

for (const failedPart of ["context", "list"]) {
  test(`a late ${failedPart === "context" ? "list" : "context"} response cannot replace a newer inventory card`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", (request) => errors.push(request.url()));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== "https://inventory-race.test") return route.abort();
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><title>재고 경쟁 검증</title><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
    });
    await page.goto(`https://inventory-race.test/?fail=${failedPart}`);
    expect(errors).toEqual([]);
    if (failedPart === "context") await expect(page.getByRole("alert")).toContainText("합성 조회 실패");
    else await expect(page.getByText(/갱신 실패 · 기존 정보 표시/)).toBeVisible();
    await page.evaluate(() => (window as unknown as { __inventoryRace: { retry(): void } }).__inventoryRace.retry());
    const currentCard = page.getByRole("button", { name: "경쟁 검증 품목, 9 봉, 상세 보기", exact: true });
    await expect(currentCard).toBeVisible();
    await page.evaluate(async () => {
      (window as unknown as { __inventoryRace: { late(): void } }).__inventoryRace.late();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await expect(currentCard).toBeVisible();
    await page.evaluate(() => (window as unknown as { __inventoryRace: { finish(): void } }).__inventoryRace.finish());
    await expect(currentCard).toBeVisible();
    expect(errors).toEqual([]);
  });
}
