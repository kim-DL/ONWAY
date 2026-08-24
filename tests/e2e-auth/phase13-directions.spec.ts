import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Phase 13 E2E is emulator-only.");
  const app = getApps().find((candidate) => candidate.name === "phase13-e2e-control")
    ?? initializeApp({ projectId: "demo-onnuriway" }, "phase13-e2e-control");
  const database = getFirestore(app);
  const snapshots = await database.collection("loginRateLimits").get();
  const batch = database.batch();
  snapshots.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  await batch.commit();
});

test("school directions use trusted coordinates and a safe official-name fallback", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();

  const search = page.getByRole("combobox", { name: "학교명 검색" });
  await search.fill("온누리고");
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.getByRole("heading", { name: "대전온누리고등학교" })).toBeVisible();
  await expect(page.getByRole("link", { name: "길안내" }).first()).toHaveAttribute(
    "href",
    "https://map.kakao.com/link/to/%EB%8C%80%EC%A0%84%EC%98%A8%EB%88%84%EB%A6%AC%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90,36.35,127.38",
  );

  await page.getByRole("button", { name: "학교 목록" }).click();
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await search.fill("새봄초");
  await page.getByRole("option", { name: /대전새봄초등학교/ }).click();
  await expect(page.getByRole("heading", { name: "대전새봄초등학교" })).toBeVisible();
  await expect(page.getByRole("link", { name: "길안내" }).first()).toHaveAttribute(
    "href",
    "https://map.kakao.com/link/search/%EB%8C%80%EC%A0%84%EC%83%88%EB%B4%84%EC%B4%88%EB%93%B1%ED%95%99%EA%B5%90",
  );
  await expect(page.getByRole("link", { name: "길안내" }).first()).toHaveAttribute("target", "_blank");

  const scan = await new AxeBuilder({ page }).include(".school-detail").analyze();
  expect(scan.violations).toEqual([]);
});
