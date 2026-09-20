import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
let script = "";
let css = "";

test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "auth-context": `export function useAuth(){return {logout:async()=>{}}}`,
    "school-assignment-picker": `export function SchoolAssignmentPicker(){return null}`,
    "sales-export-workspace": `export function SalesExportWorkspace(){return <section><h1>CSV</h1></section>}`,
    "next/dynamic": `export default function dynamic(){return ()=>null}`,
  };
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/admin-navigation.tsx"],
    outfile: "admin-navigation-fixture.js", bundle: true, write: false, platform: "browser", format: "iife",
    jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [{ name: "synthetic-admin-data", setup(builder) {
      builder.onResolve({ filter: /admin-repository$/ }, () => ({ path: fileURLToPath(new URL("./fixtures/admin-workspace-mock.ts", import.meta.url)) }));
      builder.onResolve({ filter: /auth-context$|school-assignment-picker$|sales-export-workspace$|^next\/dynamic$/ }, (args) => ({ path: args.path === "next/dynamic" ? args.path : args.path.split("/").at(-1)!, namespace: "admin-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "admin-fixture" }, (args) => ({ contents: mocks[args.path]!, loader: "tsx", resolveDir: root }));
    } }],
  });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";
  css = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
});

async function fixture(page: Page, width = 320, kind = "navigation") {
  await page.setViewportSize({ width, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/brand/onnuri-food-logo.png", (route) => route.fulfill({
    contentType: "image/png", body: readFileSync(new URL("../../public/brand/onnuri-food-logo.png", import.meta.url)),
  }));
  await page.route("**/icons/onnuriway-company-icon-192-v4.png", (route) => route.fulfill({
    contentType: "image/png", body: readFileSync(new URL("../../public/icons/onnuriway-company-icon-192-v4.png", import.meta.url)),
  }));
  await page.setContent(`<!doctype html><html lang="ko" data-fixture="${kind}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="http://admin-navigation.fixture/"><title>관리자 메뉴 검증</title><style>${globals}</style><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });
  await expect(page.getByRole("heading", { name: "운영 개요", exact: true })).toBeVisible();
}

test("320–820px has five one-row targets, a readable neutral dock, and room for the last action", async ({ page }, testInfo) => {
  await fixture(page);
  const nav = page.getByRole("navigation", { name: "관리자 빠른 메뉴", exact: true });
  for (const width of [320, 390, 560, 820]) {
    await page.setViewportSize({ width, height: 740 });
    await expect(nav.getByRole("button")).toHaveCount(5);
    await expect(page.getByRole("navigation", { name: "관리자 주요 메뉴", exact: true })).toBeHidden();
    const layout = await nav.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      children: [...element.querySelectorAll("button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, width: rect.width, height: rect.height, fits: button.scrollWidth <= button.clientWidth };
      }),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(layout.height).toBeLessThanOrEqual(80);
    expect(layout.overflow).toBe(false);
    expect(new Set(layout.children.map((item) => item.top)).size).toBe(1);
    for (const target of layout.children) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.fits).toBe(true);
    }
    await page.getByRole("button", { name: "마지막 작업", exact: true }).scrollIntoViewIfNeeded();
    const bottom = await page.getByRole("button", { name: "마지막 작업", exact: true }).boundingBox();
    const dock = await nav.boundingBox();
    expect(bottom!.y + bottom!.height).toBeLessThan(dock!.y);
    expect((await new AxeBuilder({ page }).include('nav[aria-label="관리자 빠른 메뉴"]').analyze()).violations).toEqual([]);
    if (width <= 390) await page.screenshot({ path: `output/playwright/admin-navigation/${width}-${testInfo.project.name}.png` });
  }
});

test("all nine destinations are reachable; additional selection closes its sheet and remains selected", async ({ page }) => {
  await fixture(page);
  const nav = page.getByRole("navigation", { name: "관리자 빠른 메뉴", exact: true });
  for (const title of ["거래처 관리", "학교 관리", "직원 관리", "운영 개요"]) {
    const button = nav.getByRole("button", { name: new RegExp(`^${title} ·`) });
    await button.click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(button).toHaveAttribute("aria-current", "page");
  }
  for (const title of ["학교 배정", "데이터 동기화", "CSV", "감사 기록", "설정"]) {
    await nav.getByRole("button", { name: "더보기", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "관리자 메뉴", exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("navigation").getByRole("button")).toHaveCount(5);
    await sheet.getByRole("button", { name: new RegExp(`^${title} ·`) }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "더보기", exact: true })).toHaveAttribute("aria-current", "page");
    await expect.poll(() => page.evaluate(() => window.history.state?.onnuriwaySheet ?? null)).toBeNull();
  }
  await nav.getByRole("button", { name: "더보기", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /^설정 ·/ })).toHaveAttribute("aria-current", "page");
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer").analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/playwright/admin-navigation/more-${page.viewportSize()!.width}.png` });
});

test("navigation preserves a visible selection and keyboard focus in forced colors without motion", async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const nav = page.getByRole("navigation", { name: "관리자 빠른 메뉴", exact: true });
  const selected = nav.getByRole("button", { name: /^운영 개요 ·/ });
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect(selected).toHaveCSS("outline-style", "solid");
  // The global reduced-motion contract uses 0.01ms !important for controls.
  expect(await selected.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(.00001);
  await selected.focus();
  await expect(selected).toBeFocused();
  expect((await new AxeBuilder({ page }).include('nav[aria-label="관리자 빠른 메뉴"]').analyze()).violations).toEqual([]);
});

test("Back and Escape dismiss only More, restore focus, and support quick reopen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  const more = page.getByRole("button", { name: "더보기", exact: true });
  await more.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(page.getByRole("heading", { name: "운영 개요", exact: true })).toBeVisible();
  await more.click();
  await page.getByRole("dialog").getByRole("button", { name: /^설정 ·/ }).click();
  await more.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("More traps keyboard focus, keeps review discoverable, and supports enlarged text", async ({ page }) => {
  await fixture(page);
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const nav = page.getByRole("navigation", { name: "관리자 빠른 메뉴", exact: true });
  expect(await nav.evaluate((element) => [...element.querySelectorAll("button")].every((button) =>
    button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight))).toBe(true);
  await nav.getByRole("button", { name: "더보기", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("img", { name: "검토 필요", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(sheet.getByRole("button", { name: /^설정 ·/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sheet.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer").analyze()).violations).toEqual([]);
});

test("desktop retains all nine sidebar destinations and resizing never leaves a mobile sheet open", async ({ page }, testInfo) => {
  await fixture(page, 390);
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "관리자 빠른 메뉴", exact: true })).toBeHidden();
  const sidebar = page.getByRole("navigation", { name: "관리자 주요 메뉴", exact: true });
  await expect(sidebar.getByRole("button")).toHaveCount(9);
  await sidebar.getByRole("button", { name: /^설정 ·/ }).click();
  await expect(sidebar.getByRole("button", { name: /^설정 ·/ })).toHaveAttribute("aria-current", "page");
  expect((await new AxeBuilder({ page }).include('nav[aria-label="관리자 주요 메뉴"]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/playwright/admin-navigation/desktop-${testInfo.project.name}.png` });
  await page.setViewportSize({ width: 900, height: 740 });
  for (const button of await sidebar.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

async function navigateWorkspace(page: Page, label: string, heading = label) {
  const desktop = page.getByRole("navigation", { name: "관리자 주요 메뉴", exact: true });
  const nav = await desktop.isVisible() ? desktop : page.getByRole("navigation", { name: "관리자 빠른 메뉴", exact: true });
  const destination = nav.getByRole("button", { name: new RegExp(`^${label} ·`) });
  if (await destination.count()) await destination.click();
  else {
    await nav.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("dialog", { name: "관리자 메뉴", exact: true }).getByRole("button", { name: new RegExp(`^${label} ·`) }).click();
  }
  await expect(page.locator(".admin-content").getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

for (const width of [320, 390, 900, 1280]) {
  test(`actual admin content at ${width}px keeps seven screens readable, touchable and accessible`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixture(page, width, "workspace");
    const pages = [["운영 개요", "운영 개요"], ["학교 관리", "학교 관리"], ["직원 관리", "직원 관리"], ["학교 배정", "월별 학교 배정"], ["데이터 동기화", "데이터 동기화"], ["감사 기록", "감사 기록"], ["설정", "설정"]];
    for (const [label, heading] of pages) {
      await navigateWorkspace(page, label!, heading!);
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return [...document.querySelectorAll(".admin-content *")].filter((element) => {
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return bounds.width > 0 && style.position !== "fixed" && (bounds.right > width + 1 || bounds.left < -1);
        }).map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 45) })).slice(0, 8);
      });
      expect(overflow, `${label} ${width}px overflow`).toEqual([]);
      const undersized = await page.locator(".admin-content button:visible, .admin-content a:visible").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent?.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })).filter((size) => size.width < 43.9 || size.height < 43.9));
      expect(undersized, `${label} ${width}px touch targets`).toEqual([]);
      expect((await new AxeBuilder({ page }).include(".admin-content").analyze()).violations, `${label} ${width}px accessibility`).toEqual([]);
      if (width === 390 || width === 1280) await page.screenshot({ path: `output/playwright/admin-navigation/content-${label}-${width}-${info.project.name}.png`, fullPage: true });
      await page.addStyleTag({ content: "html{font-size:200%}" });
      const enlargedLayout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll(".admin-content *")].filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && (bounds.right > innerWidth + 1 || bounds.left < -1);
        }).map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 45), right: element.getBoundingClientRect().right })).slice(0, 12),
      }));
      expect(enlargedLayout.scrollWidth <= enlargedLayout.width, `${label} ${width}px at 200%: ${JSON.stringify(enlargedLayout)}`).toBe(true);
      await page.addStyleTag({ content: "html{font-size:100%}" });
    }
    expect(errors).toEqual([]);
  });
}

test("actual employee modal traps focus and restores its trigger; a PIN generation failure stays recoverable", async ({ page }) => {
  await fixture(page, 390, "workspace");
  await navigateWorkspace(page, "직원 관리");
  const trigger = page.getByRole("button", { name: "새 직원", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "새 직원 등록", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const cancel = dialog.getByRole("button", { name: "취소", exact: true });
  await cancel.focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  const salesRole = dialog.getByRole("checkbox", { name: "영업/홍보", exact: true });
  const salesLabel = salesRole.locator("..");
  const roleTarget = (await salesLabel.boundingBox())!;
  expect(roleTarget.width).toBeGreaterThanOrEqual(44);
  expect(roleTarget.height).toBeGreaterThanOrEqual(44);
  await salesLabel.click();
  await expect(salesRole).toBeChecked();
  await salesRole.focus();
  await page.keyboard.press("Space");
  await expect(salesRole).not.toBeChecked();
  await page.evaluate(() => { window.adminFixture.failPin = true; });
  await dialog.getByRole("button", { name: "무작위 PIN 생성", exact: true }).click();
  await expect(page.getByText("PIN 생성에 실패했어요. 다시 시도해주세요.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "무작위 PIN 생성", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "직원 등록", exact: true })).toBeDisabled();
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer:modal").analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("actual employee save cannot be dismissed by Escape or PWA Back and shows its one-time result", async ({ page }) => {
  await fixture(page, 390, "workspace");
  await navigateWorkspace(page, "직원 관리");
  await page.getByRole("button", { name: "새 직원", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "새 직원 등록", exact: true });
  await dialog.getByRole("textbox", { name: "직원 이름", exact: true }).fill("검증 신규직원");
  await dialog.getByRole("button", { name: "무작위 PIN 생성", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "직원 등록", exact: true })).toBeEnabled();
  await page.evaluate(() => window.adminFixture.held.push("createEmployee"));
  await dialog.getByRole("button", { name: "직원 등록", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.adminFixture.pending)).toContain("createEmployee");
  await expect(dialog.locator("[data-admin-dialog-content]")).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.addEventListener("popstate", () => requestAnimationFrame(() => resolve()), { once: true });
    history.back();
  }));
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.adminFixture.calls.createEmployee?.length)).toBe(1);
  await page.evaluate(() => window.adminFixture.resolve("createEmployee"));
  const completed = page.getByRole("dialog", { name: "직원 등록 완료", exact: true });
  await expect(completed).toBeVisible();
  await expect(completed.getByText("123456", { exact: true })).toBeVisible();
  await completed.getByRole("button", { name: "확인하고 닫기", exact: true }).click();
  await expect(completed).toHaveCount(0);
});

test("searched employee PIN stays available until acknowledgement when a reload removes the employee from the filter, then releases navigation", async ({ page }) => {
  await fixture(page, 390, "workspace");
  await navigateWorkspace(page, "직원 관리");
  await page.getByRole("searchbox", { name: "직원 검색", exact: true }).fill("한가람");
  const detail = page.getByRole("complementary", { name: "한가람 영업부장 직원 상세", exact: true });
  await expect(detail).toBeVisible();
  const loadCount = await page.evaluate(() => window.adminFixture.calls.load?.length ?? 0);
  await page.evaluate(() => {
    window.adminFixture.held.push("rotatePin");
    window.adminFixture.renamedEmployeeOnLoad = {
      employeeId: "FIXTURE-EMPLOYEE-VERY-LONG-IDENTIFIER-FOR-RESPONSIVE-VERIFICATION",
      displayName: "김변경 영업부장",
    };
  });
  await detail.getByRole("button", { name: /^PIN 재발급/ }).click();
  const confirmation = page.getByRole("dialog", { name: "PIN을 재발급할까요?", exact: true });
  await confirmation.getByRole("button", { name: "PIN 재발급", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.adminFixture.pending)).toContain("rotatePin");
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeVisible();
  await page.evaluate(() => window.adminFixture.resolve("rotatePin"));
  const result = page.getByRole("dialog", { name: "새 PIN을 확인해주세요.", exact: true });
  await expect(result).toBeVisible();
  await expect(result.getByText("654321", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.adminFixture.calls.load?.length ?? 0)).toBe(loadCount);
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer:modal").analyze()).violations).toEqual([]);
  await page.evaluate(() => window.adminFixture.held.push("load"));
  await result.getByRole("button", { name: "확인하고 닫기", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.adminFixture.pending)).toContain("load");
  await expect(result.locator("[data-admin-dialog-content]")).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(result).toBeVisible();
  await page.evaluate(() => window.adminFixture.resolve("load"));
  await expect(result).toHaveCount(0);
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "직원 검색", exact: true })).toHaveValue("한가람");
  await expect(page.getByText("직원을 선택해주세요.", { exact: true })).toBeVisible();
  await navigateWorkspace(page, "학교 관리");
  expect(await page.evaluate(() => window.adminFixture.calls.rotatePin?.length)).toBe(1);
});

test("new NEIS previews and risk selection changes require a fresh dangerous-change acknowledgement", async ({ page }) => {
  await fixture(page, 390, "workspace");
  await navigateWorkspace(page, "데이터 동기화");
  const compare = page.getByRole("button", { name: "최신 목록 가져와 비교", exact: true });
  await compare.click();
  await page.getByRole("button", { name: "전체 선택", exact: true }).click();
  const acknowledgement = page.getByRole("checkbox", { name: "교명·주소·학교급·누락 위험 항목을 확인했습니다.", exact: true });
  const apply = page.getByRole("button", { name: "선택 항목 적용", exact: true });
  await expect(apply).toBeDisabled();
  await acknowledgement.locator("..").click();
  await expect(acknowledgement).toBeChecked();
  await expect(apply).toBeEnabled();
  await compare.click();
  await page.getByRole("button", { name: "전체 선택", exact: true }).click();
  await expect(acknowledgement).not.toBeChecked();
  await expect(apply).toBeDisabled();
  await acknowledgement.focus();
  await page.keyboard.press("Space");
  await expect(acknowledgement).toBeChecked();
  await page.keyboard.press("Space");
  await expect(acknowledgement).not.toBeChecked();
  await expect(apply).toBeDisabled();
  await acknowledgement.locator("..").click();
  await page.getByRole("button", { name: "선택 해제", exact: true }).click();
  await page.getByRole("button", { name: "전체 선택", exact: true }).click();
  await expect(acknowledgement).not.toBeChecked();
  await expect(apply).toBeDisabled();
  expect(await page.evaluate(() => window.adminFixture.calls.applyNeis?.length ?? 0)).toBe(0);
});

test("failed administrator refresh is visible and preserves the current page and known data", async ({ page }) => {
  await fixture(page, 390, "workspace");
  await navigateWorkspace(page, "학교 관리");
  await page.evaluate(() => { window.adminFixture.failLoad = true; });
  await page.locator(".admin-topbar").getByRole("button", { name: /최신 상태|새로고침/ }).click();
  await expect(page.getByText("최신 상태를 불러오지 못했어요. 다시 시도해주세요.", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".admin-refresh-note")).toContainText("이전에 확인한 정보를 표시");
  await expect(page.getByRole("heading", { name: "학교 관리", exact: true })).toBeVisible();
  await expect(page.getByText("대전행복초등학교", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.adminFixture.failLoad = false; });
  await page.locator(".admin-topbar").getByRole("button", { name: /최신 상태|새로고침/ }).click();
  await expect(page.locator(".admin-topbar").getByRole("button", { name: /최신 상태|새로고침/ })).toBeEnabled();
  await expect(page.locator(".admin-refresh-note")).toHaveCount(0);
});

test("mobile employee save stays above the dock and reachable while scrolling the form", async ({ page }, info) => {
  await fixture(page, 390, "workspace");
  await navigateWorkspace(page, "직원 관리");
  const detail = page.locator(".employee-detail");
  const save = detail.getByRole("button", { name: "변경사항 저장", exact: true });
  const dock = page.getByRole("navigation", { name: "관리자 빠른 메뉴", exact: true });
  const start = await detail.evaluate((element) => element.getBoundingClientRect().top + scrollY);
  for (const offset of [80, 240, 400]) {
    await page.evaluate((top) => scrollTo(0, top), start + offset);
    await expect(save).toBeInViewport();
    const button = (await save.boundingBox())!;
    const navigation = (await dock.boundingBox())!;
    expect(button.y + button.height).toBeLessThanOrEqual(navigation.y - 6);
    expect(await save.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
  }
  await page.screenshot({ path: `output/playwright/admin-navigation/employee-sticky-390-${info.project.name}.png` });
  await page.setViewportSize({ width: 320, height: 740 });
  await save.scrollIntoViewIfNeeded();
  expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual((await dock.boundingBox())!.y - 6);
});

test("NEIS and Kakao tabs support Arrow Home End keys with matching panels and accessible controls", async ({ page }) => {
  await fixture(page, 320, "workspace");
  await navigateWorkspace(page, "데이터 동기화");
  const tabs = page.getByRole("tablist", { name: "데이터 종류", exact: true });
  const neis = tabs.getByRole("tab", { name: "NEIS 학교 정보", exact: true });
  const kakao = tabs.getByRole("tab", { name: /^Kakao 위치 검토/ });
  await neis.focus();
  await page.keyboard.press("ArrowRight");
  await expect(kakao).toBeFocused();
  await expect(kakao).toHaveAttribute("aria-selected", "true");
  await expect(neis).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("tabpanel", { name: /^Kakao 위치 검토/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include(".admin-content").analyze()).violations).toEqual([]);
  await page.keyboard.press("ArrowLeft");
  await expect(neis).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "NEIS 학교 정보", exact: true })).toBeVisible();
  await page.keyboard.press("End");
  await expect(kakao).toBeFocused();
  await page.keyboard.press("Home");
  await expect(neis).toBeFocused();
  await expect(neis).toHaveAttribute("tabindex", "0");
  expect((await new AxeBuilder({ page }).include(".admin-content").analyze()).violations).toEqual([]);
});
