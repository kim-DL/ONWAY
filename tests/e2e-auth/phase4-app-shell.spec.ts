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
  await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "학교" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "활동" })).toHaveCount(0);

  const schoolCard = page.getByRole("button", { name: /대전온누리고등학교/ });
  await expect(schoolCard).toBeVisible();
  await expect(schoolCard.getByLabel("공동 현장정보")).toContainText("검수 07:30–08:10");
  await expect(schoolCard.getByLabel("공동 현장정보")).toContainText("대차 필요");
  await expect(schoolCard.getByLabel("공동 현장정보")).toContainText("엘리베이터 있음");
  await schoolCard.click();
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
  expect(navigationBox?.height).toBeLessThanOrEqual(76);
  await expect(navigation.getByRole("button", { name: "학교" })).toHaveCSS("flex-direction", "column");
  await expect(navigation).toHaveCSS("border-radius", "0px");
  await page.screenshot({ path: "output/playwright/phase4-visuals/01-delivery-home-mobile.png", fullPage: true });

  await page.getByRole("button", { name: /대전온누리고등학교/ }).click();
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
