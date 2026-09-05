import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

test.use({ serviceWorkers: "block" });
test.setTimeout(60_000);

function toolAsset(tool: string) {
  const manifest = JSON.parse(readFileSync(new URL("../../.next/react-loadable-manifest.json", import.meta.url), "utf8")) as Record<string, { files: string[] }>;
  const entry = Object.entries(manifest).find(([boundary]) => boundary.includes("sales-workspace.tsx") && boundary.endsWith(tool));
  if (!entry) throw new Error(`Missing deferred sales tool boundary: ${tool}`);
  const shared = new Set(Object.entries(manifest)
    .filter(([boundary]) => boundary !== entry[0])
    .flatMap(([, value]) => value.files));
  const exclusiveScript = entry[1].files.find(file => file.endsWith(".js") && !shared.has(file));
  if (!exclusiveScript) throw new Error(`No isolated script for sales tool: ${tool}`);
  return `/_next/${exclusiveScript}`;
}

for (const tool of [
  { module: "sales-route-planner", trigger: /방문 동선/, dialog: "방문 동선 만들기", loading: "방문 동선 입력 화면을 준비하고 있어요.", ready: ".sales-route-candidates" },
  { module: "sales-claim-picker", trigger: /학교 추가/, dialog: "담당 학교 가져오기", loading: "학교 선택 화면을 준비하고 있어요.", ready: ".assignment-picker" },
] as const) {
  test(`${tool.module} loads on first open and can close safely before its code arrives`, async ({ page }) => {
    if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error("Lazy sales tools are verified only against Firebase emulators.");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const asset = toolAsset(tool.module);
    let requests = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${asset}`, async route => {
      requests += 1;
      await gate;
      await route.continue();
    });

    try {
      await page.goto("/");
      await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.salesA);
      await page.getByRole("button", { name: "급식길 시작하기" }).click();
      await expect(page.locator(".assignment-card").first()).toBeVisible();
      expect(requests).toBe(0);

      const trigger = page.getByRole("toolbar", { name: "담당 학교 작업" }).getByRole("button", { name: tool.trigger });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: tool.dialog });
      await expect(dialog.getByRole("status")).toHaveText(tool.loading);
      await expect.poll(() => requests).toBe(1);
      await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeEnabled();
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();

      const response = page.waitForResponse(response => response.url().endsWith(asset));
      release();
      expect((await response).ok()).toBe(true);
      await expect(dialog).not.toBeVisible();
      await trigger.click();
      await expect(dialog.locator(tool.ready)).toBeVisible();
      if (tool.module === "sales-route-planner") {
        await expect(dialog.getByRole("button", { name: /가까운 순서 계산/ })).toBeEnabled();
      } else {
        await expect(dialog.getByRole("region", { name: "미배정 학교 다중 선택" })).toBeVisible();
      }
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}
