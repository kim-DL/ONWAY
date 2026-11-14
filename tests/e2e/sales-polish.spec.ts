import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { buildCustomerCeramicFixture } from "../helpers/build-customer-ceramic-fixture";

let fixture: Awaited<ReturnType<typeof buildCustomerCeramicFixture>>;
test.beforeAll(async () => { fixture = await buildCustomerCeramicFixture(true, false, true, true); });
async function open(page: Page, state = "") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://sales-polish.test") return route.abort();
    if (url.pathname.startsWith("/ui/") || url.pathname.startsWith("/brand/")) return route.fulfill({
      contentType: url.pathname.endsWith(".svg") ? "image/svg+xml" : "image/webp",
      body: readFileSync(new URL(`../../public${url.pathname}`, import.meta.url)),
    });
    if (url.pathname !== "/") return route.abort();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>영업 화면 검증</title><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  await page.goto(`http://sales-polish.test/?mode=sales&${state}`);
}

test("sales home keeps readable actions and school metadata across widths", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await open(page);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".school-assignment-card")).toHaveCount(2);
    expect(await page.locator(".sales-cycle-metrics > div").evaluateAll(tiles => tiles.every(tile => {
      const center = tile.getBoundingClientRect().x + tile.getBoundingClientRect().width / 2;
      return getComputedStyle(tile).textAlign === "center" && [...tile.children].every(child => {
        const bounds = child.getBoundingClientRect();
        return Math.abs(bounds.x + bounds.width / 2 - center) <= 1;
      });
    }))).toBe(true);
    for (const selector of [".sales-school-command strong", ".cycle-selector small", ".school-assignment-meta", ".school-assignment-card .status-badge"]) {
      expect(await page.locator(selector).evaluateAll(elements => elements.every(el => parseFloat(getComputedStyle(el).fontSize) >= 14))).toBe(true);
    }
    for (const button of await page.locator(".sales-school-command, .cycle-selector").all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    const rows = await page.locator(".sales-school-command").evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
    expect(rows[0]).toBe(rows[1]); expect(rows[2]).toBe(rows[3]); expect(rows[2]).toBeGreaterThan(rows[0]!);
    expect(await page.locator(".sales-school-command, .school-assignment-card").evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/sales-unslop/home-${width}-${info.project.name}.png`, fullPage: true });
  }
  expect((await new AxeBuilder({ page }).include(".sales-cycle-page").analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("ceramic action images load and the active route keeps its icon", async ({ page }) => {
  await open(page);
  await page.locator('[data-sales-icon="route"]').evaluate(element => element.parentElement!.setAttribute("data-route-active", "true"));
  const checkIcons = async () => expect(await page.locator("[data-sales-icon]").evaluateAll(async elements => {
    const backgrounds = elements.map(el => getComputedStyle(el).backgroundImage);
    if (backgrounds.some(value => value === "none")) return false;
    return Promise.all(backgrounds.map(async value => {
      const image = new Image(); image.src = value.slice(5, -2); await image.decode(); return image.naturalWidth > 0;
    })).then(results => results.every(Boolean));
  })).toBe(true);
  await checkIcons();
  await page.getByRole("button", { name: "내 학교 정리" }).click();
  await expect(page.locator('[data-sales-icon="done"]')).toHaveCount(1);
  await checkIcons();
});

test("scope and past month preserve management restrictions", async ({ page }) => {
  await open(page);
  const scope = page.getByRole("group", { name: "학교 범위" });
  const expectScopeUnderline = async () => {
    expect(await scope.evaluate(element => {
      const selected = element.querySelector<HTMLElement>('[aria-pressed="true"]')!;
      const line = getComputedStyle(element, "::after");
      return Math.abs(parseFloat(line.left) + parseFloat(line.width) / 2 - selected.offsetLeft - selected.offsetWidth / 2);
    })).toBeLessThanOrEqual(1);
    await expect(scope).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(scope.locator('[aria-pressed="true"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(scope).toHaveCSS("border-top-width", "0px");
  };
  await expectScopeUnderline();
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await expectScopeUnderline();
  await expect(page.locator(".school-assignment-card")).toHaveCount(3);
  await expect(page.locator(".sales-school-command")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "내 학교 정리" })).toHaveCount(0);
  await page.getByRole("button", { name: "내 학교", exact: true }).click();
  await expectScopeUnderline();
  await page.getByRole("button", { name: "내 학교 정리" }).click();
  await expect(page.getByRole("checkbox").first()).toBeEnabled();
  await expect(page.getByRole("checkbox").last()).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("region", { name: "선택한 담당 학교 작업" })).toBeVisible();
  await page.getByRole("button", { name: "정리 마침", exact: true }).click();
  await page.locator(".cycle-selector").click();
  await page.getByRole("button", { name: /2026년 10월/ }).click();
  await expect(page.getByRole("button", { name: "내 학교 정리" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /학교 추가/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /방문 동선/ })).toHaveCount(0);
  await expect(page.locator(".sales-school-command")).toHaveCount(1);
  const command = (await page.locator(".sales-school-command").boundingBox())!;
  const panel = (await page.locator(".sales-school-commands").boundingBox())!;
  expect(Math.abs(command.width - panel.width)).toBeLessThanOrEqual(2);
  await expect(page.getByText("과거 월 · 읽기 전용", { exact: false })).toBeVisible();
});

test("sales commands retain keyboard use and reflow with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".sales-school-command, .school-assignment-card").evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const command = page.getByRole("button", { name: "내 학교 정리" });
  await command.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "정리 마침", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox").first()).toBeEnabled();
});

test("empty and stale sales states retain context and recovery", async ({ page }) => {
  await open(page, "empty&stale");
  await expect(page.locator(".sales-cycle-empty")).toBeVisible();
  await expect(page.getByRole("button", { name: "새로 확인", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /학교 추가/ })).toBeVisible();
});

test("activity queues keep next, follow-up and completed work distinct", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page);
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "활동", exact: true }).click();
  await expect(page.locator(".school-activity-row")).toHaveCount(1);
  await expect(page.locator(".school-activity-row")).toContainText("대전예시초등학교");
  await page.getByRole("button", { name: "후속 관리", exact: true }).click();
  await expect(page.locator(".school-activity-row")).toHaveCount(1);
  await expect(page.locator(".school-activity-row")).toContainText("대전예시교육대학교부설중학교");
  await expect(page.getByRole("heading", { name: "후속 관리 학교" })).toBeVisible();
  await expect(page.locator(".sales-activity-heading > span")).toHaveCSS("white-space", "nowrap");
  await expect(page.locator(".school-activity-row__meta small")).toHaveCSS("font-size", "14px");
  expect((await new AxeBuilder({ page }).include(".sales-activity-page").analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.locator(".school-activity-row")).toHaveCount(0);
  await expect(page.locator(".sales-activity-empty")).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
