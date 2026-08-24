import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

async function loginAndOpenSearch(page: Page) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await expect(page.getByRole("dialog", { name: "어느 학교로 갈까요?" })).toBeVisible();
  await expect(page.getByText("로컬 검색 준비됨")).toBeVisible();
  return page.getByRole("combobox", { name: "학교명 검색" });
}

test("search ranks exact, abbreviation, initials, alias, and fuzzy matches locally", async ({ page }) => {
  const input = await loginAndOpenSearch(page);
  const scenarios = [
    ["대전새봄초등학교", "대전새봄초등학교", "학교명 일치"],
    ["새봄초", "대전새봄초등학교", "축약명 일치"],
    ["ㄷㅈㅅㅂㅊ", "대전새봄초등학교", "초성 일치"],
    ["대전구명고등학교", "대전새빛고등학교", "이전 이름 일치"],
    ["새봄쵸", "대전새봄초등학교", "오타 후보"],
  ] as const;

  for (const [query, expectedSchool, expectedMatch] of scenarios) {
    await input.fill(query);
    const firstResult = page.getByRole("listbox", { name: "학교 검색 결과" }).getByRole("option").first();
    await expect(firstResult).toContainText(expectedSchool);
    await expect(firstResult).toContainText(expectedMatch);
  }
});

test("typing performs no external or Firestore requests and cached search survives offline", async ({ page, context }) => {
  const input = await loginAndOpenSearch(page);
  const requests: string[] = [];
  const capture = (request: Request) => requests.push(request.url());
  page.on("request", capture);

  for (let index = 0; index < 20; index += 1) {
    await input.fill(index % 2 === 0 ? `새봄${index}` : "ㄷㅈㅅㅂㅊ");
  }
  page.off("request", capture);

  const forbiddenRequests = requests.filter((url) =>
    /firestore|googleapis|open\.neis|kakao/iu.test(url),
  );
  expect(forbiddenRequests).toEqual([]);
  const databaseNames = await page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name),
  );
  expect(databaseNames).toContain("onnuriway-search-v1");

  await context.setOffline(true);
  await input.fill("ㄷㅈㅅㅂㅊ");
  await expect(page.getByRole("option", { name: /대전새봄초등학교/ })).toBeVisible();
});

test("keyboard selection records recent schools and the search dialog remains accessible", async ({ page }) => {
  const input = await loginAndOpenSearch(page);
  await input.fill("새봄초");

  const accessibilityScan = await new AxeBuilder({ page }).include(".school-search-panel").analyze();
  expect(accessibilityScan.violations).toEqual([]);

  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "대전새봄초등학교" })).toBeVisible();
  await page.getByRole("button", { name: "학교 목록" }).click();
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await expect(page.getByRole("option", { name: /대전새봄초등학교/ })).toBeVisible();

  const undersizedTargets = await page.locator(".school-search-panel button:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44
        ? [{ label: target.textContent?.trim() ?? target.getAttribute("aria-label"), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersizedTargets).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "어느 학교로 갈까요?" })).toHaveCount(0);
});
