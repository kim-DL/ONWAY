import { expect, test } from "@playwright/test";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";

test("delivery photo loading copy, progress and delayed detail are centered", async ({ page }) => {
  const fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-loading.tsx");
  await page.clock.install();
  await page.route("http://photo-loading.test/**", route => route.fulfill({contentType:"text/html", body:
    `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>","<\\/script>")}</script></html>`}));
  await page.goto("http://photo-loading.test/");
  await expect(page.getByRole("status")).toHaveCount(3);
  await page.clock.fastForward(10000);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({width,height:844});
    for (const status of await page.getByRole("status").all()) {
      await expect(status).toHaveCSS("align-items","center");
      await expect(status).toHaveCSS("text-align","center");
      await expect(status.locator(":scope > span")).toHaveCount(3);
      const parent = (await status.boundingBox())!;
      for (const child of await status.locator(":scope > span").all()) {
        const box = (await child.boundingBox())!;
        expect(Math.abs(box.x+box.width/2-parent.x-parent.width/2)).toBeLessThan(1);
      }
    }
  }
});
