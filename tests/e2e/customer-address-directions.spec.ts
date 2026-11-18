import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";
let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/customer-address-directions.tsx", [{ name: "directions-isolation", setup(builder) {
    builder.initialOptions.define = { ...builder.initialOptions.define, "process.env.NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS": '"false"' };
    builder.onResolve({ filter: /customer-repository$|firebase\/client$|^firebase\/functions$|^client-only$/ }, ({ path }) => ({ path, namespace: "directions-isolation" }));
    builder.onLoad({ filter: /.*/, namespace: "directions-isolation" }, ({ path }) => ({ loader: "ts", resolveDir: root, contents: path === "client-only" ? "export {};" : `
      export const customerRepository = {};
      export const customerErrorMessage=()=>"error";
      const user={uid:"fixture",getIdTokenResult:async()=>({claims:{employeeId:"fixture",sessionVersion:1,permissionsVersion:1}})};
      export const getFirebaseClientServices=()=>({auth:{currentUser:user},functions:{}});
      export const getFirebaseAuthIfInitialized=()=>null;
      export const ensureFirebaseAppCheckReady=async()=>{};
      export const httpsCallable=()=>async({query})=>{
        window.observeDirectionQuery?.(query);
        await new Promise(r=>new URLSearchParams(location.search).has('hold')?window.__finishDirections=r:setTimeout(r,100));
        return {data:new URLSearchParams(location.search).has('fail')?[]:[{id:"address",name:query,address:query,point:{latitude:36.4,longitude:127.5}}]};
      };
    ` }));
  } }]);
});
async function open(page: import("@playwright/test").Page, fail = false, hold = false) {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "map.kakao.com") return route.fulfill({ contentType: "text/html", body: "<title>카카오맵 연결 검증</title>" });
    if (url.hostname === "customer-directions.test") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
    return route.abort();
  });
  await page.goto(`https://customer-directions.test/${hold ? "?hold" : fail ? "?fail" : ""}`);
  expect(errors).toEqual([]);
  await expect(page.getByRole("heading", { name: "주소 길안내 검증" })).toBeVisible();
}
test("address lookup indicates progress until the destination is ready", async ({ page, isMobile }, info) => {
  await open(page, false, true);
  if (isMobile) {
    const link = page.getByRole("region", { name: "목록 카드" }).getByRole("link");
    await link.click();
    await expect(link).toHaveAttribute("aria-busy", "true");
    await page.waitForFunction(() => "__finishDirections" in window);
    await page.evaluate(() => (window as unknown as { __finishDirections: () => void }).__finishDirections());
    await expect(page).toHaveURL(/map\.kakao\.com\/link\/to\//);
    return;
  }
  const newPage = page.context().waitForEvent("page");
  await page.getByRole("region", { name: "목록 카드" }).getByRole("link").click();
  const popup = await newPage;
  const viewport = info.project.name === "mobile-chromium" ? { width: 320, height: 760 } : { width: 1280, height: 800 };
  await popup.setViewportSize(viewport);
  await popup.screenshot({ path: `output/kakao-directions-transition/pending-${info.project.name}.png`, scale: "css" });
  await expect(popup.getByRole("status", { name: "길안내 연결 중" })).toBeVisible();
  expect(await popup.locator("body").innerText()).toBe("");
  const box = await popup.getByRole("status").boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(1);
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(1);
  expect(await popup.evaluate(() => ({ language: document.documentElement.lang,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ language: "ko", viewport: "width=device-width, initial-scale=1", overflow: false });
  await popup.emulateMedia({ reducedMotion: "reduce" });
  await expect(popup.getByRole("status")).toHaveCSS("animation-name", "none");
  await popup.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  await expect(popup.getByRole("status")).toHaveCSS("animation-name", "none");
  await page.evaluate(() => (window as unknown as { __finishDirections: () => void }).__finishDirections());
  await expect(popup).toHaveURL(`https://map.kakao.com/link/to/${encodeURIComponent("예시식품")},36.4,127.5`);
  await popup.close();
});
for (const region of ["목록 카드", "상세 화면"]) {
  test(`${region} opens Kakao directions from the displayed address rather than the old pin`, async ({ page, isMobile }) => {
    const lookups: string[] = [];
    await page.exposeFunction("observeDirectionQuery", (query: string) => lookups.push(query));
    await open(page);
    const newPage = isMobile ? Promise.resolve(page) : page.context().waitForEvent("page");
    await page.getByRole("region", { name: region }).getByRole("link").click();
    const popup = await newPage;
    await expect(popup).toHaveURL(`https://map.kakao.com/link/to/${encodeURIComponent("예시식품")},36.4,127.5`);
    expect(lookups).toEqual(["대전 대덕구 예시로 38"]);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
  });
}
test("an unresolved address keeps the app open and cleans up any popup", async ({ page, isMobile }) => {
  await open(page, true);
  const alert = page.waitForEvent("dialog"); const newPage = isMobile ? Promise.resolve(null) : page.context().waitForEvent("page");
  await page.getByRole("region", { name: "목록 카드" }).getByRole("link").click();
  const popup = await newPage; const dialog = await alert;
  expect(dialog.message()).toContain("주소를 확인하지 못했어요"); await dialog.accept();
  if (popup) await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page).toHaveURL("https://customer-directions.test/?fail");
});
test("popup blocking falls back to address-based directions in the current tab", async ({ page }) => {
  await page.addInitScript(() => { window.open = () => null; });
  await open(page);
  await page.getByRole("region", { name: "목록 카드" }).getByRole("link").click();
  await expect(page).toHaveURL(`https://map.kakao.com/link/to/${encodeURIComponent("예시식품")},36.4,127.5`);
});
