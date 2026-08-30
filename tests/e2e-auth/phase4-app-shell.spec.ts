import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

async function login(page: Page, pin: string) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(pin);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
}

test("delivery shell exposes role navigation and opens a real school detail shell", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.delivery);

  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
  await expect(page.getByText("READY TO GO", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "연결된 학교" })).toHaveCount(0);
  await expect(page.locator(".school-card")).toHaveCount(0);
  await expect(page.getByText("8곳", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "학교" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "활동" })).toHaveCount(0);

  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  const search = page.getByRole("combobox", { name: "학교명 검색" });
  await search.fill("온누리고");
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.getByRole("heading", { name: "대전온누리고등학교" })).toBeVisible();
  await expect(page.getByLabel("학교 빠른 작업")).toBeVisible();
  await page.getByRole("button", { name: "학교 목록" }).click();
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
});

test("mobile delivery navigation stays compact and yields detail space to the field brief", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, PHASE3_TEST_PINS.delivery);

  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  await expect(navigation).toBeVisible();
  const navigationBox = await navigation.boundingBox();
  expect(navigationBox?.height).toBeLessThanOrEqual(68);
  await expect(navigation.getByRole("button", { name: "학교" })).toHaveCSS("flex-direction", "column");
  await expect(navigation).toHaveCSS("border-radius", "0px");
  await expect(navigation).toHaveCSS("background-color", "rgba(248, 250, 255, 0.88)");
  const activeIndicator = await navigation.getByRole("button", { name: "학교" }).evaluate((element) => ({
    shadow: getComputedStyle(element).boxShadow,
    indicatorOpacity: getComputedStyle(element, "::after").opacity,
    indicatorWidth: Number.parseFloat(getComputedStyle(element, "::after").width),
  }));
  expect(activeIndicator.shadow).toBe("none");
  expect(activeIndicator.indicatorOpacity).toBe("1");
  expect(activeIndicator.indicatorWidth).toBeGreaterThanOrEqual(24);
  await page.screenshot({ path: "output/playwright/phase4-visuals/01-delivery-home-mobile.png", fullPage: true });

  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await page.getByRole("combobox", { name: "학교명 검색" }).fill("온누리고");
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.getByRole("region", { name: "현장 핵심 요약" })).toContainText("검수시간");
  await expect(page.getByRole("region", { name: "현장 핵심 요약" })).toContainText("엘리베이터");
  await expect(navigation).toBeHidden();
  await expect(page.getByLabel("학교 빠른 작업")).toBeVisible();
  await page.screenshot({ path: "output/playwright/phase4-visuals/02-school-detail-mobile.png", fullPage: true });
});

test("sales shell provides assigned schools, team scope, and accessible touch targets", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesA);

  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "활동" })).toBeVisible();
  await expect(page.getByRole("button", { name: "내 학교", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".assignment-card")).toHaveCount(2);
  await expect(page.locator(".assignment-card__rail")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "모두가 함께 쓰는 학교 정보" })).toHaveCount(0);

  const accessibilityScan = await new AxeBuilder({ page }).include(".workspace-shell").analyze();
  expect(accessibilityScan.violations).toEqual([]);

  const undersizedTargets = await page.locator(".workspace-shell button:visible, .workspace-shell a:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44
        ? [{ label: target.textContent?.trim() ?? target.getAttribute("aria-label"), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersizedTargets).toEqual([]);

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page.locator(".assignment-card")).toHaveCount(5);
  await page.getByRole("button", { name: "활동" }).click();
  await expect(page.getByRole("heading", { name: /확인하고.*바로 움직이기/ })).toBeVisible();
});
