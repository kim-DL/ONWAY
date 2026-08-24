import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

async function setAuthzSessionVersion(uid: string, sessionVersion: number) {
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-onnuriway/databases/(default)/documents/authz/${uid}?updateMask.fieldPaths=sessionVersion`,
    {
      method: "PATCH",
      headers: {
        authorization: "Bearer owner",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fields: { sessionVersion: { integerValue: String(sessionVersion) } },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Authz emulator update failed with HTTP ${response.status}.`);
  }
}

async function submitPin(page: Page, pin: string) {
  await page.getByLabel("직원 PIN").fill(pin);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
}

test("valid PIN persists through reopen and explicit logout clears the session", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /6자리 PIN/ })).toBeVisible();
  await submitPin(page, PHASE3_TEST_PINS.delivery);

  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible({ timeout: 15_000 });

  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible({ timeout: 15_000 });
  await expect(reopened.getByRole("heading", { name: /6자리 PIN/ })).toHaveCount(0);

  await reopened.evaluate(() => localStorage.setItem("onnuriway:private:e2e", "remove-me"));
  await reopened.getByRole("button", { name: "설정" }).click();
  await expect(reopened.getByText("EMP-DELIVERY")).toBeVisible();
  await reopened.getByRole("button", { name: "로그아웃" }).click();
  const logoutDialog = reopened.getByRole("dialog", { name: "로그아웃할까요?" });
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(reopened.getByRole("heading", { name: /6자리 PIN/ })).toBeVisible();
  await expect.poll(() => reopened.evaluate(() => localStorage.getItem("onnuriway:private:e2e"))).toBeNull();

  let auditPayload = "";
  await expect.poll(async () => {
    const auditResponse = await fetch(
      "http://127.0.0.1:8080/v1/projects/demo-onnuriway/databases/(default)/documents/auditLogs",
      { headers: { authorization: "Bearer owner" } },
    );
    expect(auditResponse.ok).toBe(true);
    auditPayload = JSON.stringify(await auditResponse.json());
    return auditPayload;
  }, { timeout: 5_000 }).toContain("LOGOUT");
  expect(auditPayload).toContain("LOGIN_SUCCESS");
  expect(auditPayload).not.toContain(PHASE3_TEST_PINS.delivery);
});

test("unknown PIN uses a generic error and locks that lookup after five failures", async ({ page }) => {
  await page.goto("/");

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await submitPin(page, "999998");
    await expect(page.locator("#pin-error")).toHaveText("PIN을 확인해주세요.");
  }

  await submitPin(page, "999998");
  await expect(page.locator("#pin-error")).toHaveText("잠시 후 다시 시도해주세요.");
});

test("disabled employee cannot sign in", async ({ page }) => {
  await page.goto("/");
  await submitPin(page, PHASE3_TEST_PINS.disabled);

  await expect(page.locator("#pin-error")).toHaveText("PIN을 확인해주세요.");
  await expect(page.getByText("EMP-DISABLED")).toHaveCount(0);
});

test("authz revocation invalidates an active session without waiting for token expiry", async ({ page }) => {
  await page.goto("/");
  await submitPin(page, PHASE3_TEST_PINS.salesA);
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible({ timeout: 15_000 });

  await setAuthzSessionVersion("uid-sales-a", 2);
  try {
    await expect(page.getByRole("heading", { name: /다시 로그인이 필요합니다/ })).toBeVisible();
    await page.getByRole("button", { name: "PIN 로그인으로 돌아가기" }).click();
    await expect(page.getByRole("heading", { name: /6자리 PIN/ })).toBeVisible();
  } finally {
    await setAuthzSessionVersion("uid-sales-a", 1);
  }
});

test("PIN login screen has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /6자리 PIN/ })).toBeVisible();
  const accessibilityScan = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScan.violations).toEqual([]);
});
