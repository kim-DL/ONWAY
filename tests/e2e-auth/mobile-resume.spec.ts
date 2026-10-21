import { expect, test, type Page } from "@playwright/test";
import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

async function login(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
}

test("mobile cold resume opens the last tab while connectivity verification is unavailable", async ({ page, browserName }, testInfo) => {
  await login(page);
  const pageErrors: string[] = [];
  let cancelledEmulatorStreams = 0;
  page.on("pageerror", (error) => {
    // On reload WebKit reports the previous document's cancelled local emulator
    // Listen stream as a native access-control error. The new document's failed
    // connectivity probe prevents it from opening any authz stream at all.
    if (browserName === "webkit" && /127\.0\.0\.1:8080\/google\.firestore\.v1\.Firestore\/Listen\/channel\?/.test(error.message)
      && /due to access control checks\.$/.test(error.message)) {
      cancelledEmulatorStreams += 1;
      return;
    }
    pageErrors.push(error.message);
  });
  let loginRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/employeeLogin")) loginRequests += 1; });
  // Intercept in the document: WebKit's service worker can bypass page.route().
  // Keep the production worker active and leave Firebase requests untouched.
  await page.addInitScript(() => {
    const state = window as Window & { mobileResumeBlockedProbes?: number };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === "/api/connectivity") {
        state.mobileResumeBlockedProbes = (state.mobileResumeBlockedProbes ?? 0) + 1;
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      return realFetch(input, init);
    };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { mobileResumeBlockedProbes?: number }).mobileResumeBlockedProbes ?? 0)).toBeGreaterThan(0);
  await expect(page.getByLabel("직원 PIN")).toHaveCount(0);
  expect(loginRequests).toBe(0);
  await testInfo.attach("emulator-stream-cancellation", { contentType: "application/json", body: JSON.stringify({ browserName, cancelledEmulatorStreams }) });
  expect(pageErrors).toEqual([]);
});

test("an expired display cache waits offline and recovers without PIN or logout", async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter((key) => key.includes(":offline-session:"))) {
      const saved = JSON.parse(localStorage.getItem(key)!);
      saved.verifiedAt = Date.now() - 25 * 60 * 60 * 1_000;
      localStorage.setItem(key, JSON.stringify(saved));
    }
  });
  // Simulate the reported connection state while keeping the local dev shell
  // reachable. This exercises real Firebase persistence, not OS/PWA suspension.
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: false }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("로그인은 유지되어 있어요. 연결이 돌아오면 자동으로 이어집니다.")).toBeVisible();
  await expect(page.getByLabel("직원 PIN")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("직원 PIN")).toHaveCount(0);
});
