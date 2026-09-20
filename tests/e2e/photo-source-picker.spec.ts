import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";

const root = fileURLToPath(new URL("../../", import.meta.url));
const suppliedPhoto = "C:/Users/HOME/Pictures/앨범 사진.jpg";
let script = ""; let css = ""; let jpeg: Buffer;
test.beforeAll(async () => {
  jpeg = await sharp({ create: { width: 3024, height: 4032, channels: 3, background: "#c4d7c6" } }).jpeg().toBuffer();
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/photo-source-picker.tsx"], outfile: "photo-source.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "isolated-photo-source", setup(builder) {
    builder.onResolve({ filter: /inventory-repository$|private-client-state$|customer-photo-repository$|auth-context$/ }, (args) => ({ path: args.path, namespace: "photo-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "photo-fixture" }, (args) => ({ loader: "js", contents: args.path.endsWith("private-client-state")
      ? "export const registerPrivateBlobUrl=url=>url;export const forgetPrivateBlobUrl=url=>URL.revokeObjectURL(url);"
      : args.path.endsWith("auth-context") ? "export function useAuth(){return {state:{status:'authenticated',session:{uid:'FIXTURE',claims:{sessionVersion:1,permissionsVersion:1}}}}}"
        : args.path.endsWith("inventory-repository") ? "export const inventoryRepository={photo:()=>{throw Error('Unexpected fixture request')}};export const inventoryErrorMessage=()=> 'Unexpected fixture request';"
          : "export const customerPhotoRepository={load:()=>{throw Error('Unexpected fixture request')}};" }));
  } }] });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8") + result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});
async function fixture(page: Page, mode: string) {
  await page.setViewportSize({ width: 360, height: 840 });
  await page.route("**/*", (route) => route.abort());
  await page.setContent(`<!doctype html><html lang="ko" data-fixture="${mode}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>사진 읽기 검증</title><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
for (const mode of ["customer", "inventory"]) {
  const albumLabel = mode === "inventory" ? "제품 사진 직접 촬영" : "거래처 전경사진 선택";
  const fileLabel = "거래처 전경사진 파일에서 선택";
  const previewLabel = mode === "inventory" ? "저장할 제품 사진 미리보기" : "선택한 거래처 전경사진 미리보기";

  test(`${mode} keeps the native input mounted, enabled and uncleared until the byte snapshot is complete`, async ({ page }) => {
    await fixture(page, mode);
    await page.evaluate((label) => {
      const read = File.prototype.arrayBuffer;
      let repeatSent = false;
      File.prototype.arrayBuffer = function () {
        if (this.name !== "held.jpg") return read.call(this);
        const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
        // Repeat the native change before React can render the busy state.
        // The synchronous selection guard must still permit only one read.
        if (!repeatSent) { repeatSent = true; input.dispatchEvent(new Event("change", { bubbles: true })); }
        return new Promise<ArrayBuffer>((resolve, reject) => {
          (window as typeof window & { releasePhotoRead: () => void }).releasePhotoRead = () => {
            if (!input.isConnected || input.disabled || !input.value) reject(new DOMException("Fixture native input released early", "NotReadableError"));
            else void read.call(this).then(resolve, reject);
          };
        });
      };
    }, albumLabel);
    const input = page.getByLabel(albumLabel, { exact: true });
    await input.setInputFiles({ name: "held.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await expect(page.locator("main")).toHaveAttribute("data-reading", "true");
    await expect(input).toBeEnabled(); await expect(input).not.toHaveValue("");
    await expect(page.getByRole("button", { name: mode === "inventory" ? "직접 촬영" : "앨범에서 선택", exact: true })).toBeDisabled();
    await page.evaluate(() => (window as typeof window & { releasePhotoRead: () => void }).releasePhotoRead());
    const preview = page.getByRole("img", { name: previewLabel, exact: true });
    await expect(preview).toBeVisible(); await expect(input).toHaveValue("");
    await expect(page.locator("main")).toHaveAttribute("data-reading", "false");
    await expect(page.getByLabel("검증용 변경 횟수")).toHaveText("1");
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([1920, 2560]);
  });

  test(`${mode} retries partial bytes using the real FileReader and preserves its supported recovery path`, async ({ page }, info) => {
    await fixture(page, mode);
    await page.evaluate(() => {
      const read = File.prototype.arrayBuffer; const fallback = FileReader.prototype.readAsArrayBuffer;
      File.prototype.arrayBuffer = function () {
        if (this.name === "partial.jpg") return Promise.resolve(new ArrayBuffer(2));
        if (this.name === "unreadable.jpg") return Promise.reject(new DOMException("Fixture native provider denied", "NotReadableError"));
        return read.call(this);
      };
      FileReader.prototype.readAsArrayBuffer = function (file) {
        if (file instanceof File && file.name === "unreadable.jpg") throw new DOMException("Fixture native provider denied", "NotReadableError");
        return fallback.call(this, file);
      };
    });
    const album = page.getByLabel(albumLabel, { exact: true }); const preview = page.getByRole("img", { name: previewLabel, exact: true });
    await album.setInputFiles({ name: "partial.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await expect(preview).toBeVisible(); const previous = await preview.getAttribute("src");
    await album.setInputFiles({ name: "unreadable.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await expect(page.getByRole("alert")).toContainText("원본 사진을 읽지 못했어요"); await expect(preview).toHaveAttribute("src", previous!);
    const recovery = page.getByRole("button", { name: mode === "inventory" ? "직접 촬영" : "파일에서 선택", exact: true }); await expect(recovery).toBeEnabled();
    expect((await recovery.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const chooser = page.waitForEvent("filechooser"); await recovery.click();
    expect(await (await chooser).element().getAttribute("aria-label")).toBe(mode === "inventory" ? albumLabel : fileLabel);
    const files = page.getByLabel(mode === "inventory" ? albumLabel : fileLabel, { exact: true });
    if (mode === "inventory") { await expect(files).toHaveAttribute("capture", "environment"); await expect(page.locator('input[type="file"]')).toHaveCount(1); await expect(page.getByRole("button", { name: "파일에서 선택", exact: true })).toHaveCount(0); }
    else await expect(files).not.toHaveAttribute("accept");
    await files.setInputFiles({ name: "unsupported.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await expect(page.getByRole("alert")).toContainText(mode === "inventory" ? "다시 촬영" : "JPEG"); await expect(preview).toHaveAttribute("src", previous!);
    await files.setInputFiles({ name: "saved-to-device.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await expect(preview).not.toHaveAttribute("src", previous!); await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(files).toHaveValue(""); await page.getByRole("button", { name: "사진 저장 준비 확인" }).click();
    await expect(page.getByLabel("검증용 사진 준비 결과")).toHaveText(/^image\/webp:\d+$/);
    await page.screenshot({ path: `output/playwright/photo-source/${mode}-recovered-${info.project.name}.png`, fullPage: true });
  });

  test(`${mode} ignores a late native read after dismissal and can choose a new photo after reopening`, async ({ page }) => {
    await fixture(page, mode);
    await page.evaluate(() => {
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        if (this.name !== "dismissed.jpg") return read.call(this);
        return new Promise<ArrayBuffer>((resolve, reject) => { (window as typeof window & { releasePhotoRead: () => void }).releasePhotoRead = () => { void read.call(this).then(resolve, reject); }; });
      };
    });
    await page.getByLabel(albumLabel, { exact: true }).setInputFiles({ name: "dismissed.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await expect(page.locator("main")).toHaveAttribute("data-reading", "true");
    await page.getByRole("button", { name: "선택 화면 열기/닫기" }).click();
    await page.evaluate(() => (window as typeof window & { releasePhotoRead: () => void }).releasePhotoRead());
    await expect(page.getByLabel("검증용 변경 횟수")).toHaveText("0");
    await page.getByRole("button", { name: "선택 화면 열기/닫기" }).click();
    await page.getByLabel(albumLabel, { exact: true }).setInputFiles({ name: "reopened.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await expect(page.getByRole("img", { name: previewLabel, exact: true })).toBeVisible();
    await expect(page.getByLabel("검증용 변경 횟수")).toHaveText("1");
  });

  test(`${mode} prepares baseline JPEG bytes using the browser decoder, without claiming a physical camera test`, async ({ page }, info) => {
    test.skip(!existsSync(suppliedPhoto), "The user's private local baseline is not available on this machine.");
    await fixture(page, mode);
    await page.getByLabel(albumLabel, { exact: true }).setInputFiles(suppliedPhoto);
    const preview = page.getByRole("img", { name: previewLabel, exact: true }); await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([1920, 2560]);
    await page.getByRole("button", { name: "사진 저장 준비 확인" }).click();
    await expect(page.getByLabel("검증용 사진 준비 결과")).toHaveText(/^image\/webp:\d+$/);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.screenshot({ path: `output/playwright/photo-source/${mode}-supplied-album-${info.project.name}.png`, fullPage: true });
  });
}
