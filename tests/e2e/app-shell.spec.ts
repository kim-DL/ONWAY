import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders a safe configuration boundary without Firebase environment values", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("급식길");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /앱 연결 설정이\s*필요합니다\./,
  );
  await expect(page.getByText("Firebase 공개 환경 변수")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
});

test("has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  const accessibilityScan = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScan.violations).toEqual([]);
});
