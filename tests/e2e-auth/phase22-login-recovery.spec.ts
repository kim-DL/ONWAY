import { expect, test, type Page } from "@playwright/test";
import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

async function submitPin(page: Page) {
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
}

test("service failure is not reported as a bad PIN and a retry succeeds", async ({ page }) => {
  await page.goto("/");
  await page.route("**/employeeLogin", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    expect(new URL(route.request().url()).hostname).toBe("127.0.0.1");
    await route.fulfill({
      status: 503, contentType: "application/json",
      body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "Fixture unavailable" } }),
    });
  });
  await submitPin(page);
  await expect(page.locator("#pin-error")).toContainText("연결이 원활하지 않아요");
  await expect(page.getByLabel("직원 PIN")).toBeFocused();
  await expect(page.getByLabel("직원 PIN")).toHaveValue("");
  await page.unroute("**/employeeLogin");
  await submitPin(page);
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible({ timeout: 30_000 });
});

test("failed custom-token exchange keeps the form and actionable error visible", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let exchangeRequests = 0;
  await page.route("**/accounts:signInWithCustomToken*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    expect(new URL(route.request().url()).hostname).toBe("127.0.0.1");
    exchangeRequests += 1;
    await held;
    await route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ error: { code: 400, message: "INVALID_CUSTOM_TOKEN" } }),
    });
  });
  try {
    await submitPin(page);
    await expect.poll(() => exchangeRequests, { timeout: 20_000 }).toBe(1);
    await expect(page.getByRole("heading", { name: /6자리 PIN/ })).toBeVisible();
    await expect(page.getByLabel("직원 PIN")).toBeDisabled();
    await expect(page.getByRole("button", { name: "확인 중" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Google로 관리자 로그인" })).toBeDisabled();
    release();
    await expect(page.locator("#pin-error")).toContainText("로그인 연결을 완료하지 못했어요");
    await expect(page.getByLabel("직원 PIN")).toBeEnabled();
    await expect(page.getByLabel("직원 PIN")).toBeFocused();
    await page.unroute("**/accounts:signInWithCustomToken*");
    await submitPin(page);
    await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible({ timeout: 30_000 });
  } finally {
    release();
  }
});
