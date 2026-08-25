import { expect, test, type Page } from "@playwright/test";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible({ timeout: 15_000 });
}

test("a Pilot participant exports privacy-safe device evidence from an accessible settings action", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as typeof window & { __PILOT_DIAGNOSTICS__?: string }).__PILOT_DIAGNOSTICS__ = value;
        },
      },
    });
  });

  await login(page);
  await page.getByRole("button", { name: "설정" }).click();
  const action = page.getByRole("button", { name: "진단 내보내기" });
  await expect(action).toBeVisible();
  const bounds = await action.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);

  await action.click();
  await expect(page.getByText("개인정보 없는 기기 진단을 복사했습니다.")).toBeVisible();
  const serialized = await page.evaluate(() => (
    window as typeof window & { __PILOT_DIAGNOSTICS__?: string }
  ).__PILOT_DIAGNOSTICS__);
  expect(serialized).toBeTruthy();
  const diagnostics = JSON.parse(serialized ?? "{}") as Record<string, unknown>;
  expect(diagnostics).toMatchObject({
    schemaVersion: 1,
    appVersion: "phase18-rc1",
    deviceState: { online: true },
  });
  expect(serialized).not.toMatch(/EMP-|employeeId|schoolId|query|uid|email|phone|userAgent/iu);
});

test("a device without Clipboard support downloads the same privacy-safe JSON", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  await login(page);
  await page.getByRole("button", { name: "설정" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "진단 내보내기" }).click(),
  ]);
  await expect(page.getByText("개인정보 없는 기기 진단을 저장했습니다.")).toBeVisible();
  expect(download.suggestedFilename()).toMatch(/^onnuriway-device-diagnostics-\d+\.json$/u);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const serialized = Buffer.concat(chunks).toString("utf8");
  expect(JSON.parse(serialized)).toMatchObject({ schemaVersion: 1, appVersion: "phase18-rc1" });
  expect(serialized).not.toMatch(/EMP-|employeeId|schoolId|query|uid|email|phone|userAgent/iu);
});
