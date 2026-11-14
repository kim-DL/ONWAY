import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readApplicationStylesheet } from "../helpers/read-stylesheet";

const root = fileURLToPath(new URL("../../", import.meta.url));
let script = "";
let css = "";
function html(kind: string) {
  return `<!doctype html><html lang="ko" data-fixture="${kind}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 계정 관리 검증</title><style>${readApplicationStylesheet()}${css}</style></head><body><div id="root"></div></body></html>`;
}
test.beforeAll(async () => {
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/operations-access.tsx"], outfile: "operations-access.js", bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [{ name: "isolated-account-fixture", setup(builder) {
      builder.onResolve({ filter: /(?:pin-change|google-access)-repository$/ }, (args) => {
        if (args.importer.endsWith("operations-access-mock.ts") && args.path.includes("pin-change")) return undefined;
        return { path: fileURLToPath(new URL("./fixtures/operations-access-mock.ts", import.meta.url)) };
      });
      builder.onResolve({ filter: /admin-repository$/ }, () => ({ path: fileURLToPath(new URL("./fixtures/admin-workspace-mock.ts", import.meta.url)) }));
    } }],
  });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  css = result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
  mkdirSync(new URL("../../output/ops-renewal-20261114/preview/", import.meta.url), { recursive: true });
  for (const kind of ["pin", "admin"]) writeFileSync(new URL(`../../output/ops-renewal-20261114/preview/${kind}.html`, import.meta.url), html(kind).replace("</body>", `<script src="/fixture.js"></script></body>`));
  writeFileSync(new URL("../../output/ops-renewal-20261114/preview/fixture.js", import.meta.url), script);
});
async function fixture(page: Page, kind = "pin", width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("http://127.0.0.1:3102/operations-fixture", (route) => route.fulfill({ contentType: "text/html", body: html(kind) }));
  await page.goto("http://127.0.0.1:3102/operations-fixture");
  await page.addScriptTag({ content: script });
  await expect(page.getByRole("heading", { name: kind === "pin" ? "설정" : "직원 관리", exact: true })).toBeVisible();
}
async function fillPin(page: Page) {
  await page.getByRole("button", { name: "PIN 변경", exact: true }).click();
  await page.getByLabel("현재 PIN", { exact: true }).fill("482619");
  await page.getByLabel("새 PIN", { exact: true }).fill("071839");
  await page.getByLabel("새 PIN 확인", { exact: true }).fill("071839");
}
test("PIN change keeps the session view, clears secrets on close, and blocks offline submission", async ({ page }) => {
  await fixture(page);
  await page.getByLabel("온라인", { exact: true }).uncheck();
  await fillPin(page);
  await expect(page.getByRole("button", { name: "PIN 변경하기" })).toBeDisabled();
  await expect(page.getByText("인터넷에 연결하면 PIN을 변경할 수 있습니다.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("온라인", { exact: true }).check();
  await page.getByRole("button", { name: "PIN 변경", exact: true }).click();
  await expect(page.getByLabel("현재 PIN", { exact: true })).toHaveValue("");
  await page.keyboard.press("Escape");
  await fillPin(page);
  await page.getByRole("button", { name: "PIN 변경하기" }).click();
  await expect(page.getByText("PIN을 변경했습니다.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("현재 PIN", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByText("검증 직원 · 로그인 유지")).toBeVisible();
  expect(await page.evaluate(() => window.accessFixture.pinCalls.length)).toBe(1);
});
test("PIN duplicate and mismatched confirmation are readable and retry preserves the request identity", async ({ page }) => {
  await fixture(page); await fillPin(page);
  await page.getByLabel("새 PIN 확인", { exact: true }).fill("071830");
  await page.getByRole("button", { name: "PIN 변경하기" }).click();
  await expect(page.getByRole("alert")).toContainText("서로 다릅니다");
  expect(await page.evaluate(() => window.accessFixture.pinCalls.length)).toBe(0);
  await page.getByLabel("새 PIN 확인", { exact: true }).fill("071839");
  await page.evaluate(() => { window.accessFixture.pinMode = "duplicate"; });
  await page.getByRole("button", { name: "PIN 변경하기" }).click();
  await expect(page.getByRole("alert")).toContainText("이미 사용 중인 PIN");
  await page.evaluate(() => { window.accessFixture.pinMode = "uncertain"; });
  await page.getByRole("button", { name: "PIN 변경하기" }).click();
  await expect(page.getByRole("alert")).toContainText("변경 결과를 확인하지 못했습니다");
  await page.getByRole("button", { name: "PIN 변경하기" }).click();
  await expect(page.getByText("PIN을 변경했습니다.", { exact: true })).toBeVisible();
  const ids = await page.evaluate(() => window.accessFixture.pinCalls.map((call) => call.requestId));
  expect(new Set(ids).size).toBe(1);
});
test("PIN pending locks submission and dismissal; mobile form is accessible", async ({ page }, info) => {
  await fixture(page, "pin", 320); await fillPin(page);
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer").analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/ops-renewal-20261114/pin-${info.project.name}.png` });
  await page.evaluate(() => { window.accessFixture.pinMode = "hold"; });
  await page.getByRole("button", { name: "PIN 변경하기" }).click();
  await expect(page.getByRole("button", { name: "변경 중…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "PIN 변경", exact: true })).toBeVisible();
  await page.evaluate(() => window.accessFixture.resolvePin());
  await expect(page.getByText("PIN을 변경했습니다.", { exact: true })).toBeVisible();
});
test("operator tabs, long email and enlarged text fit without losing keyboard focus", async ({ page }, info) => {
  await fixture(page, "admin", 320);
  await page.getByRole("tab", { name: "직원 계정", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Google 운영자", exact: true })).toBeFocused();
  await expect(page.getByText("responsible-person.with-long-address@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "검증 운영자 운영 권한 해제" })).toHaveCount(0);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/ops-renewal-20261114/google-${info.project.name}.png` });
  await page.addStyleTag({ content: "html {font-size:200%}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("operator registration handles duplicate, pending work and confirmed result", async ({ page }) => {
  await fixture(page, "admin");
  await page.getByRole("tab", { name: "Google 운영자", exact: true }).click();
  await page.getByRole("button", { name: "운영자 등록", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Google 운영자 등록", exact: true });
  await dialog.getByLabel("이름", { exact: true }).fill("검증 담당자");
  await dialog.getByLabel("Google 이메일", { exact: true }).fill("new@example.test");
  await page.evaluate(() => { window.accessFixture.googleMode = "duplicate"; });
  await dialog.getByRole("button", { name: "계정 등록", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("이미 등록된");
  await dialog.getByLabel("Google 이메일", { exact: true }).fill("new-other@example.test");
  await page.evaluate(() => { window.accessFixture.googleMode = "hold"; });
  await dialog.getByRole("button", { name: "계정 등록", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "반영 중…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await page.evaluate(() => window.accessFixture.resolveGoogle());
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("new-other@example.test", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => new Set(window.accessFixture.googleCalls.map((call) => call.requestId)).size)).toBe(2);
});
test("PIN recovery defaults to keeping login and session revocation needs an explicit selection", async ({ page }) => {
  await fixture(page, "admin");
  await page.getByRole("button", { name: /한가람 영업부장/ }).click();
  await page.getByRole("button", { name: /^임시 PIN 발급/ }).click();
  const dialog = page.getByRole("dialog", { name: "임시 PIN을 발급할까요?", exact: true });
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("button", { name: "임시 PIN 발급", exact: true }).click();
  expect(await page.evaluate(() => (window.adminFixture.calls.rotatePin![0] as {revokeSessions: boolean}).revokeSessions)).toBe(false);
  await page.getByRole("button", { name: "확인하고 닫기", exact: true }).click();
  await page.getByRole("button", { name: /^임시 PIN 발급/ }).click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "임시 PIN 발급", exact: true }).click();
  expect(await page.evaluate(() => (window.adminFixture.calls.rotatePin![1] as {revokeSessions: boolean}).revokeSessions)).toBe(true);
});

test("parent refresh reloads Google access and a failed refresh preserves data but prevents changes", async ({ page }) => {
  await fixture(page, "admin");
  await page.getByRole("tab", { name: "Google 운영자", exact: true }).click();
  await expect(page.getByText("owner@example.test", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.accessFixture.failList = true; });
  await page.getByRole("button", { name: "검증 새로고침", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("목록을 갱신하지 못했습니다");
  await expect(page.getByText("owner@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "운영자 등록", exact: true })).toBeDisabled();
  await page.evaluate(() => { window.accessFixture.failList = false; });
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.getByRole("button", { name: "운영자 등록", exact: true })).toBeEnabled();
});

test("pending Google accounts show the supported next action instead of an unusable employee editor", async ({ page }) => {
  await fixture(page, "admin");
  await page.getByRole("button", { name: /Google 대기 운영자/ }).click();
  await expect(page.getByRole("button", { name: "변경사항 저장", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Google 운영자 보기", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Google 운영자", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("operator access removal requires confirmation and updates the selected account only", async ({ page }) => {
  await fixture(page, "admin");
  await page.getByRole("tab", { name: "Google 운영자", exact: true }).click();
  await page.getByRole("button", { name: "검증 책임자 운영 권한 해제", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "운영 권한을 해제할까요?", exact: true });
  await expect(dialog.getByRole("button", { name: "권한 해제", exact: true })).toBeDisabled();
  await dialog.getByLabel("해제 사유", { exact: true }).fill("담당 변경");
  await dialog.getByRole("button", { name: "권한 해제", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("해제됨", { exact: true })).toBeVisible();
  await expect(page.getByText("사용 중", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.accessFixture.googleCalls)).toEqual([expect.objectContaining({ employeeId: "FIXTURE-GOOGLE" })]);
});
