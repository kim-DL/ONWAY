import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";
let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/customer-address-directions.tsx", [{ name: "directions-isolation", setup(builder) {
    builder.initialOptions.define = { ...builder.initialOptions.define, "process.env.NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS": '"false"' };
    builder.onResolve({ filter: /customer-repository$|customer-directions-repository$|^client-only$/ }, ({ path }) => ({ path, namespace: "directions-isolation" }));
    builder.onLoad({ filter: /.*/, namespace: "directions-isolation" }, ({ path }) => ({ loader: "ts", resolveDir: root, contents: path === "client-only" ? "export {};" : `
      export const customerRepository = {};
      export const customerErrorMessage=()=>"error";
      export async function resolveDirectionsPoint(query){window.__directionQueries ??= [];window.__directionQueries.push(query);await new Promise(r=>setTimeout(r,100));return new URLSearchParams(location.search).has('fail')?null:{latitude:36.4,longitude:127.5};}
    ` }));
  } }]);
});
async function open(page: import("@playwright/test").Page, fail = false) {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "map.kakao.com") return route.fulfill({ contentType: "text/html", body: "<title>카카오맵 연결 검증</title>" });
    if (url.hostname === "customer-directions.test") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
    return route.abort();
  });
  await page.goto(`https://customer-directions.test/${fail ? "?fail" : ""}`);
  expect(errors).toEqual([]);
  await expect(page.getByRole("heading", { name: "주소 길안내 검증" })).toBeVisible();
}
for (const region of ["목록 카드", "상세 화면"]) {
  test(`${region} opens Kakao directions from the displayed address rather than the old pin`, async ({ page }) => {
    await open(page);
    const newPage = page.context().waitForEvent("page");
    await page.getByRole("region", { name: region }).getByRole("link").click();
    const popup = await newPage;
    await expect(popup).toHaveURL(`https://map.kakao.com/link/to/${encodeURIComponent("예시식품")},36.4,127.5`);
    expect(await page.evaluate(() => (window as unknown as { __directionQueries: string[] }).__directionQueries)).toEqual(["대전 대덕구 예시로 38"]);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
  });
}
test("an unresolved address closes the popup and keeps the app open", async ({ page }) => {
  await open(page, true);
  const alert = page.waitForEvent("dialog"); const newPage = page.context().waitForEvent("page");
  await page.getByRole("region", { name: "목록 카드" }).getByRole("link").click();
  const popup = await newPage; const dialog = await alert;
  expect(dialog.message()).toContain("주소를 확인하지 못했어요"); await dialog.accept();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page).toHaveURL("https://customer-directions.test/?fail");
});
test("popup blocking falls back to address-based directions in the current tab", async ({ page }) => {
  await page.addInitScript(() => { window.open = () => null; });
  await open(page);
  await page.getByRole("region", { name: "목록 카드" }).getByRole("link").click();
  await expect(page).toHaveURL(`https://map.kakao.com/link/to/${encodeURIComponent("예시식품")},36.4,127.5`);
});
