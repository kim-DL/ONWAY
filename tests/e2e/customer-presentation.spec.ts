import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";
import type { SchoolFieldProfile, SchoolFieldProfilePatch, SchoolPhoto } from "../../src/domain/school";
import type { CachedSchoolDetail } from "../../src/features/school-detail/school-detail-cache";

type SchoolDetailFixtureState = { profile: SchoolFieldProfile | null; photos: SchoolPhoto[]; salesData?: CachedSchoolDetail["salesData"]; saves: { schoolId: string; expectedRevision: number; patch: SchoolFieldProfilePatch }[]; holdSave?: boolean; rejectSave?: boolean; releaseSave?: () => void };

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
let script = "";
let css = "";
let smallJpeg: Buffer;
let portraitJpeg: Buffer;
const longPassword = '0012*#<>&"'.repeat(12);
test.beforeAll(async () => {
  [smallJpeg, portraitJpeg] = await Promise.all([
    sharp({ create: { width: 120, height: 80, channels: 3, background: "#519a89" } }).jpeg().toBuffer(),
    sharp({ create: { width: 3024, height: 4032, channels: 3, background: "#8eb2c4" } }).jpeg().toBuffer(),
  ]);
  const mocks: Record<string, string> = {
    dynamic: `import React,{lazy,Suspense} from 'react'; export default function dynamic(load,options={}){const Component=lazy(()=>load().then(value=>({default:value.default??value})));return function FixtureDynamic(props){const Loading=options.loading;return <Suspense fallback={Loading?<Loading/>:null}><Component {...props}/></Suspense>}}`,
    schoolDetail: `import {useCallback,useEffect,useReducer} from 'react';export function useSchoolDetail(school,session,mode){const[,rerender]=useReducer(x=>x+1,0);const refresh=useCallback(()=>rerender(),[]);useEffect(()=>{window.addEventListener('fixture:detail-changed',refresh);return()=>window.removeEventListener('fixture:detail-changed',refresh)},[refresh]);const fixture=window.schoolDetailFixture;return {status:'ready',refreshing:false,stale:false,source:'memory',sessionNamespace:'SYNTHETIC-DELIVERY',refresh,initialSchool:school,detail:{school,fieldProfile:fixture.profile,photos:fixture.photos,salesData:mode==='sales'?fixture.salesData??null:null}}}`,
    salesHistory: `export function useSalesHistory(){return {status:'ready',visits:[],hasMore:false,loadingMore:false,refresh:()=>{},loadMore:async()=>{}}}`,
    salesHistoryRepository: `export const salesHistoryRepository={updateProfile:async()=>{throw new Error('Unexpected fixture sales write')}}`,
    schoolDetailRepository: `export const schoolDetailRepository={updateFieldProfile:async(input)=>{const fixture=window.schoolDetailFixture;fixture.saves.push(structuredClone(input));await new Promise((resolve,reject)=>{fixture.releaseSave=()=>fixture.rejectSave?reject(new Error('Synthetic save failure')):resolve();if(!fixture.holdSave)setTimeout(fixture.releaseSave,80)});fixture.profile={...fixture.profile,...input.patch,revision:(fixture.profile?.revision??0)+1};window.dispatchEvent(new Event('fixture:detail-changed'));return{revision:fixture.profile.revision}}}`,
    auth: `export function useAuth(){return {state:{status:'authenticated',session:{uid:'FIXTURE',claims:{sessionVersion:1,permissionsVersion:1}}}}}`,
    private: `export const registerPrivateBlobUrl=url=>url; export const forgetPrivateBlobUrl=url=>URL.revokeObjectURL(url);`,
    photo: `export const customerPhotoRepository={load:async(_,id,{signal})=>{await new Promise(done=>setTimeout(done,120)); signal.throwIfAborted(); if(id.endsWith('1'))throw new Error('fixture unavailable'); return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#dce9e9"/><rect y="285" width="640" height="115" fill="#bbc4c5"/><rect x="90" y="95" width="460" height="205" fill="#f6f7f5"/><rect x="90" y="95" width="460" height="38" fill="#326b66"/><rect x="140" y="170" width="140" height="130" fill="#d0d9db"/><rect x="355" y="170" width="115" height="90" fill="#94b7c6"/><text x="320" y="120" text-anchor="middle" font-size="20" fill="white">TEST FIXTURE</text></svg>'],{type:'image/svg+xml'})}};`,
    map: `export function CustomerMap(){return <div aria-label="검증용 지도 대체 영역" style={{height:180,borderRadius:12,background:'#edf2f4',display:'grid',placeItems:'center',color:'#52636b'}}>지도 영역 · UI 검증용</div>}`,
    repository: `export const customerRepository={reverseLocation:async()=>{await new Promise(done=>setTimeout(done,120));return {district:'서구',administrativeDong:'둔산1동',address:'대전광역시 서구 검증로 1'}}};`,
    schoolPhoto: `export const PHOTO_UPLOAD_MAX_BYTES=10485760; export const PHOTO_UPLOAD_TYPES=['image/jpeg','image/png','image/webp']; export const schoolPhotoRepository={getVariant:async({slotId})=>{await new Promise(done=>setTimeout(done,80));return {blob:new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e2eaf0"/><path d="M0 450L800 390V600H0Z" fill="#b6c8d0"/><rect x="100" y="140" width="600" height="300" fill="#f8f7f2"/><rect x="100" y="140" width="600" height="55" fill="#4b7f99"/><rect x="280" y="260" width="200" height="180" fill="#9fb9c2"/><text x="400" y="180" text-anchor="middle" font-size="28" fill="white">SCHOOL FIXTURE '+slotId+'</text></svg>'],{type:'image/svg+xml'}),source:'memory'}},upload:async()=>{throw Error('Unexpected fixture write')},delete:async()=>{throw Error('Unexpected fixture write')},restore:async()=>{throw Error('Unexpected fixture write')}};`,
  };
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/customer-presentation.tsx"], outfile: "customer-presentation.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-customer-presentation", setup(builder) {
      builder.onResolve({ filter: /auth-context$|private-client-state$|customer-photo-repository$|customer-map$|customer-repository$|school-photo-repository$|use-school-detail$|school-detail-repository$|use-sales-history$|sales-history-repository$|^next\/dynamic$/ }, (args) => args.path === "next/dynamic" && !/school-detail\.tsx$/.test(args.importer) ? undefined : ({ path: args.path === "next/dynamic" ? "dynamic" : args.path.endsWith("use-sales-history") ? "salesHistory" : args.path.endsWith("sales-history-repository") ? "salesHistoryRepository" : args.path.endsWith("use-school-detail") ? "schoolDetail" : args.path.endsWith("school-detail-repository") ? "schoolDetailRepository" : args.path.endsWith("auth-context") ? "auth" : args.path.endsWith("private-client-state") ? "private" : args.path.endsWith("customer-map") ? "map" : args.path.endsWith("customer-repository") ? "repository" : args.path.endsWith("school-photo-repository") ? "schoolPhoto" : "photo", namespace: "customer-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "customer-fixture" }, (args) => ({ contents: mocks[args.path]!, loader: "tsx", resolveDir: root }));
    } }],
  });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  css = result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

async function fixture(page: Page, width: number, kind = "presentation", passwordCase = "short") {
  await page.setViewportSize({ width, height: 840 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const html = `<!doctype html><html lang="ko" data-fixture="${kind}" data-password-case="${passwordCase}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>거래처 UI 검증</title><style>${globals}</style><style>${css}</style></head><body><div id="root"></div></body></html>`;
  if (kind === "school-detail" || kind === "sales-detail") {
    // Keep real secure-context APIs such as crypto.randomUUID without contacting a service.
    await page.route("https://school.fixture/**", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("https://school.fixture/detail");
  } else await page.setContent(html);
  await page.addScriptTag({ content: script });
  if (kind === "presentation") await expect(page.locator("[data-customer-recent-card]")).toHaveCount(5);
}

async function expectPasswordSummary(card: Locator, selectButton: Locator, password: string) {
  const summary = card.locator("[data-customer-password-summary]");
  await expect(summary).toHaveCount(1);
  await expect(summary).toBeVisible();
  await expect(summary.locator("span")).toHaveText("출입비번");
  await expect(summary.locator("strong")).toHaveText(password);
  const escaped = password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(selectButton).toHaveAccessibleDescription(new RegExp(`출입비번\\s*${escaped}`));
  expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

async function recordPhotoMorphs(page: Page) {
  await page.evaluate(() => {
    const diagnostics = window as typeof window & { photoMorphCalls: { duration: number; transforms: (string | number | null | undefined)[] }[]; photoMorphAnimations: Animation[]; photoCloseResetFrames: string[]; photoLayerFades: number };
    diagnostics.photoMorphCalls = [];
    diagnostics.photoMorphAnimations = [];
    diagnostics.photoCloseResetFrames = [];
    diagnostics.photoLayerFades = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = new Proxy(animate, { apply(target, thisArg: Element, args: Parameters<Element["animate"]>) {
      const animation: Animation = Reflect.apply(target, thisArg, args);
      if (thisArg.matches(".bottom-sheet-layer") && (animation.effect as KeyframeEffect).getKeyframes().some((frame) => Number(frame.opacity) === 0)) diagnostics.photoLayerFades += 1;
      if (thisArg.matches("[data-photo-morph-stage]")) {
        const effect = animation.effect as KeyframeEffect;
        diagnostics.photoMorphCalls.push({ duration: Number(effect.getTiming().duration), transforms: effect.getKeyframes().map((frame) => frame.transform) });
        diagnostics.photoMorphAnimations.push(animation);
        const cancel = animation.cancel.bind(animation);
        animation.cancel = () => {
          const closing = (thisArg as HTMLElement).dataset.photoMorphState === "closing";
          cancel();
          if (closing && thisArg.isConnected) diagnostics.photoCloseResetFrames.push(getComputedStyle(thisArg).transform);
        };
      }
      return animation;
    } });
  });
}

async function photoMorphCalls(page: Page) {
  return page.evaluate(() => (window as typeof window & { photoMorphCalls: { duration: number; transforms: (string | number | null | undefined)[] }[] }).photoMorphCalls);
}

async function captureMorphMidpoint(page: Page, path: string, origin: Locator) {
  const source = (await origin.boundingBox())!;
  const captured = await page.evaluate(() => {
    const animation = (window as typeof window & { photoMorphAnimations: Animation[] }).photoMorphAnimations.at(-1);
    if (!animation || animation.playState !== "running") return null;
    const effect = animation.effect as KeyframeEffect;
    const stage = effect.target as HTMLElement;
    const first = effect.getKeyframes()[0]!;
    animation.pause();
    animation.currentTime = 0;
    const initialStyle = getComputedStyle(stage);
    const initialMatrix = new DOMMatrixReadOnly(initialStyle.transform);
    const inset = String(first.clipPath).match(/^inset\(([\d.]+)px ([\d.]+)px/);
    const bounds = stage.getBoundingClientRect();
    const insetY = Number(inset?.[1]);
    const insetX = Number(inset?.[2]);
    const cropped = { x: bounds.x + insetX * initialMatrix.a, y: bounds.y + insetY * initialMatrix.d, width: bounds.width - 2 * insetX * initialMatrix.a, height: bounds.height - 2 * insetY * initialMatrix.d };
    animation.currentTime = Number(animation.effect!.getTiming().duration) * .18;
    const style = getComputedStyle(stage);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return { a: matrix.a, d: matrix.d, clipPath: style.clipPath, initialA: initialMatrix.a, initialD: initialMatrix.d, cropped };
  });
  expect(captured, "native opening animation remains available for a real intermediate-frame capture").not.toBeNull();
  expect(captured!.a).toBeCloseTo(captured!.d, 5);
  expect(captured!.initialA).toBeCloseTo(captured!.initialD, 5);
  expect(captured!.clipPath).toMatch(/^inset\(/);
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(captured!.cropped[key] - source[key]), `${key} source crop`).toBeLessThan(4);
  await page.screenshot({ path });
  await expect(page.locator("[data-photo-morph-state='opening']")).toHaveCount(1);
  await page.evaluate(() => (window as typeof window & { photoMorphAnimations: Animation[] }).photoMorphAnimations.at(-1)!.play());
  await page.clock.resume();
}

async function capturePhotoClose(page: Page, viewer: Locator, path: string, action?: () => Promise<unknown>) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1_000);
  if (action) await action();
  else await viewer.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(viewer.locator("[data-photo-morph-stage]")).toHaveAttribute("data-photo-morph-state", "closing");
  const sample = await viewer.evaluate((dialog) => {
    const animations = dialog.getAnimations({ subtree: true });
    for (const animation of animations) {
      const duration = Number(animation.effect?.getTiming().duration);
      if (!Number.isFinite(duration) || duration <= 0) continue;
      animation.pause();
      animation.currentTime = duration * .72;
    }
    const stage = dialog.querySelector<HTMLElement>("[data-photo-morph-stage]")!;
    return { transform: getComputedStyle(stage).transform, opacity: getComputedStyle(dialog).opacity, background: getComputedStyle(dialog.querySelector(".bottom-sheet")!).backgroundColor };
  });
  expect(sample.transform).not.toBe("none");
  expect(Number(sample.opacity), "the large dialog surface fades together with its returning photo").toBeLessThan(.9);
  await page.screenshot({ path });
  await viewer.evaluate((dialog) => { for (const animation of dialog.getAnimations({ subtree: true })) animation.play(); });
  await page.clock.resume();
}

test("camera and album are distinct, cancel preserves selection, replacement/removal stay accessible", async ({ page }, info) => {
  await fixture(page, 320, "picker");
  const camera = page.getByLabel("거래처 전경사진 촬영", { exact: true });
  const album = page.getByLabel("거래처 전경사진 선택", { exact: true });
  await expect(camera).toHaveAttribute("capture", "environment");
  await expect(camera).toHaveAttribute("accept", "image/*");
  await expect(album).toHaveAttribute("accept", "image/*");
  await expect(album).not.toHaveAttribute("capture");
  await expect(album).not.toHaveAttribute("multiple");
  for (const name of ["직접 촬영", "앨범에서 선택"]) {
    const button = page.getByRole("button", { name, exact: true });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const chooser = page.waitForEvent("filechooser");
    await button.click();
    expect(await (await chooser).element().getAttribute("aria-label")).toBe(name === "직접 촬영" ? "거래처 전경사진 촬영" : "거래처 전경사진 선택");
  }
  await album.setInputFiles({ name: "small.jpg", mimeType: "image/jpeg", buffer: smallJpeg });
  const preview = page.getByRole("img", { name: "선택한 거래처 전경사진 미리보기" });
  await expect(preview).toBeVisible();
  const previous = await preview.getAttribute("src");
  await album.setInputFiles([]);
  await expect(preview).toHaveAttribute("src", previous!);
  await album.setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByRole("alert")).toContainText("JPEG");
  await expect(preview).toHaveAttribute("src", previous!);
  await page.getByRole("button", { name: "저장 상태 전환" }).click();
  await expect(page.getByRole("button", { name: "직접 촬영", exact: true })).toBeDisabled();
  await expect(album).toBeDisabled();
  await page.getByRole("button", { name: "저장 상태 전환" }).click();
  await page.getByRole("button", { name: "사진 제거", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/playwright/customer-presentation/photo-picker-320-${info.project.name}.png`, fullPage: true });
});

test("portrait preview is prepared once, keeps the native input until reading finishes and fills its card", async ({ page }, info) => {
  await fixture(page, 320, "picker");
  await page.evaluate(() => {
    const diagnostics = window as typeof window & { releasePhotoRead?: () => void; photoDecodes: number };
    const read = File.prototype.arrayBuffer;
    let delayed = false;
    File.prototype.arrayBuffer = function () {
      if (this.name === "delayed-portrait.jpg" && !delayed) {
        delayed = true;
        return new Promise<ArrayBuffer>((resolve, reject) => { diagnostics.releasePhotoRead = () => { void read.call(this).then(resolve, reject); }; });
      }
      return read.call(this);
    };
    const decode = window.createImageBitmap;
    diagnostics.photoDecodes = 0;
    window.createImageBitmap = new Proxy(decode, { apply(target, thisArg, args) { diagnostics.photoDecodes += 1; return Reflect.apply(target, thisArg, args); } });
  });
  const album = page.getByLabel("거래처 전경사진 선택", { exact: true });
  await album.setInputFiles({ name: "delayed-portrait.jpg", mimeType: "image/jpeg", buffer: portraitJpeg });
  await expect(page.locator("main")).toHaveAttribute("data-photo-reading", "true");
  await expect(album).not.toHaveValue("");
  await expect(page.getByRole("button", { name: "앨범에서 선택", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "사진 저장 준비 확인", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as typeof window & { releasePhotoRead?: () => void }).releasePhotoRead?.());
  const preview = page.getByRole("img", { name: "선택한 거래처 전경사진 미리보기", exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([1920, 2560]);
  await expect(preview).toHaveCSS("object-fit", "cover");
  await expect(album).toHaveValue("");
  await expect(page.locator("main")).toHaveAttribute("data-photo-reading", "false");
  expect(await page.evaluate(() => (window as typeof window & { photoDecodes: number }).photoDecodes)).toBe(1);
  await page.getByRole("button", { name: "사진 저장 준비 확인", exact: true }).click();
  await expect(page.getByLabel("검증용 사진 준비 결과", { exact: true })).toHaveText(/^image\/webp:\d+$/);
  expect(await page.evaluate(() => (window as typeof window & { photoDecodes: number }).photoDecodes)).toBe(1);
  const previous = await preview.getAttribute("src");
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await page.getByRole("button", { name: "저장 상태 전환", exact: true }).click();
  await page.getByRole("button", { name: "저장 상태 전환", exact: true }).click();
  await expect(preview).toHaveAttribute("src", previous!);
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/playwright/customer-presentation/portrait-picker-${info.project.name}.png`, fullPage: true });
});

test("corrupt JPEG fails before preview, offers retry and recovers after another selection", async ({ page }) => {
  await fixture(page, 320, "picker");
  const album = page.getByLabel("거래처 전경사진 선택", { exact: true });
  await album.setInputFiles({ name: "truncated.jpg", mimeType: "image/jpeg", buffer: smallJpeg.subarray(0, 120) });
  const retry = page.getByRole("button", { name: "다시 준비", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("img", { name: "선택한 거래처 전경사진 미리보기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "사진을 준비하지 못했어요" })).toBeVisible();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await retry.click();
  await expect(retry).toBeVisible();
  await album.setInputFiles({ name: "recovered.jpg", mimeType: "image/jpeg", buffer: smallJpeg });
  await expect(page.getByRole("img", { name: "선택한 거래처 전경사진 미리보기", exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("HEIC header with JPEG MIME is identified without replacing a valid selection; cancel keeps it", async ({ page }) => {
  await fixture(page, 320, "picker");
  const album = page.getByLabel("거래처 전경사진 선택", { exact: true });
  await album.setInputFiles({ name: "valid.jpg", mimeType: "image/jpeg", buffer: smallJpeg });
  const preview = page.getByRole("img", { name: "선택한 거래처 전경사진 미리보기", exact: true });
  await expect(preview).toBeVisible();
  const previous = await preview.getAttribute("src");
  // Only a synthetic HEIF container header is needed to exercise format detection.
  const heifHeader = Buffer.alloc(32);
  heifHeader.writeUInt32BE(32);
  heifHeader.write("ftypmif1", 4, "ascii");
  heifHeader.write("heic", 16, "ascii");
  await album.setInputFiles({ name: "mislabelled.jpg", mimeType: "image/jpeg", buffer: heifHeader });
  await expect(page.getByRole("alert")).toContainText("HEIC");
  await expect(preview).toHaveAttribute("src", previous!);
  await expect(album).toHaveValue("");
  await album.setInputFiles([]);
  await expect(preview).toHaveAttribute("src", previous!);
  await expect(page.locator("main")).toHaveAttribute("data-photo-reading", "false");
});

test("album provider falls back to FileReader and preserves the prior selection if both reading paths fail", async ({ page }) => {
  await fixture(page, 320, "picker");
  const album = page.getByLabel("거래처 전경사진 선택", { exact: true });
  await album.setInputFiles({ name: "valid.jpg", mimeType: "image/jpeg", buffer: smallJpeg });
  const preview = page.getByRole("img", { name: "선택한 거래처 전경사진 미리보기", exact: true });
  await expect(preview).toBeVisible();
  let previous = await preview.getAttribute("src");
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    const fallback = FileReader.prototype.readAsArrayBuffer;
    File.prototype.arrayBuffer = function () { return ["fallback.jpg", "unreadable.jpg"].includes(this.name) ? Promise.reject(new DOMException("Fixture file cannot be read", "NotReadableError")) : read.call(this); };
    FileReader.prototype.readAsArrayBuffer = function (blob) {
      if (blob instanceof File && blob.name === "unreadable.jpg") throw new DOMException("Fixture provider failed", "NotReadableError");
      return fallback.call(this, blob);
    };
  });
  await album.setInputFiles({ name: "fallback.jpg", mimeType: "image/jpeg", buffer: smallJpeg });
  await expect(preview).toBeVisible();
  await expect(preview).not.toHaveAttribute("src", previous!);
  await expect(page.getByRole("alert")).toHaveCount(0);
  previous = await preview.getAttribute("src");
  await album.setInputFiles({ name: "unreadable.jpg", mimeType: "image/jpeg", buffer: smallJpeg });
  await expect(page.getByRole("alert")).toContainText("원본 사진을 읽지 못했어요");
  await expect(page.getByRole("alert")).toContainText("다운로드");
  await expect(preview).toHaveAttribute("src", previous!);
  await expect(album).toHaveValue("");
  await expect(page.locator("main")).toHaveAttribute("data-photo-reading", "false");
  await expect(page.getByRole("button", { name: "앨범에서 선택", exact: true })).toBeEnabled();
  await album.setInputFiles({ name: "retry.jpg", mimeType: "image/jpeg", buffer: smallJpeg });
  await expect(preview).toBeVisible();
  await expect(preview).not.toHaveAttribute("src", previous!);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("detail photo opens a private enlarged viewer, zooms and closes without dismissing detail", async ({ page, context }, info) => {
  await fixture(page, 390);
  await page.locator("[data-customer-recent-card]").first().click();
  const detail = page.getByRole("dialog", { name: "강은유통", exact: true });
  const expand = detail.getByRole("button", { name: "강은유통 전경사진 크게 보기" });
  await expect(expand).toBeVisible();
  const original = await detail.getByRole("img", { name: "강은유통 전경 사진", exact: true }).getAttribute("src");
  await expand.click();
  const viewer = page.getByRole("dialog", { name: "강은유통 전경사진", exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img")).toHaveAttribute("src", original!);
  await viewer.getByRole("button", { name: "2배 확대", exact: true }).click();
  await expect(viewer.locator('[data-zoomed="true"]')).toBeVisible();
  await expect.poll(() => viewer.locator('[data-zoomed="true"]').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await viewer.getByRole("button", { name: "전체 보기", exact: true }).click();
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer:modal").analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/playwright/customer-presentation/photo-viewer-390-${info.project.name}.png` });
  await viewer.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(expand).toBeFocused();
  await expand.click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expand.click();
  await expect(viewer).toBeVisible();
  await page.goBack();
  await expect(viewer).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expand.click();
  await expect(viewer).toBeVisible();
  await context.setOffline(true);
  await expect(viewer).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("img")).toHaveCount(0);
  await context.setOffline(false);
  await expect(expand).toBeVisible();
});

test("customer photo morph connects the original image, traps focus and safely handles rapid close and parent removal", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await fixture(page, 390);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await recordPhotoMorphs(page);
  const card = page.locator("[data-customer-recent-card]").first();
  await card.click();
  const detail = page.getByRole("dialog", { name: "강은유통", exact: true });
  const expand = detail.getByRole("button", { name: "강은유통 전경사진 크게 보기", exact: true });
  await expect(expand).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1_000);
  await expand.click();
  await page.clock.runFor(32);
  const viewer = page.getByRole("dialog", { name: "강은유통 전경사진", exact: true });
  const stage = viewer.locator("[data-photo-morph-stage]");
  await expect(viewer).toBeVisible();
  await expect.poll(async () => (await photoMorphCalls(page)).length).toBe(1);
  await captureMorphMidpoint(page, `output/playwright/customer-presentation/morph-customer-midpoint-${info.project.name}.png`, expand);
  await expect(stage).toHaveAttribute("data-photo-morph-state", "open");
  const opening = (await photoMorphCalls(page))[0]!;
  expect(opening.duration).toBeGreaterThan(0);
  expect(opening.duration).toBeLessThanOrEqual(400);
  expect(opening.transforms[0]).toContain("translate(");
  expect(opening.transforms.at(-1)).toBe("none");
  for (let index = 0; index < 7; index += 1) {
    await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
    expect(await viewer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await viewer.getByRole("button", { name: "2배 확대", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(stage).toHaveAttribute("data-zoomed", "true");
  await viewer.getByRole("button", { name: "전체 보기", exact: true }).click();
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer:modal").analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/playwright/customer-presentation/morph-customer-${info.project.name}.png` });
  await capturePhotoClose(page, viewer, `output/playwright/customer-presentation/morph-customer-close-${info.project.name}.png`);
  await expect(viewer).toHaveCount(0);
  await expect(expand).toBeFocused();
  expect(await page.evaluate(() => (window as typeof window & { photoCloseResetFrames: string[] }).photoCloseResetFrames), "the return transform must stay held until the viewer is removed").toEqual([]);
  const closed = await photoMorphCalls(page);
  expect(closed).toHaveLength(2);
  expect(closed[1]!.transforms[0]).toBe("none");
  expect(closed[1]!.transforms.at(-1)).toContain("translate(");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expand.click();
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(expand).toBeFocused();
  }
  expect(await page.evaluate(() => (window as typeof window & { photoLayerFades: number }).photoLayerFades)).toBe(4);
  await expand.click();
  await expect(stage).toHaveAttribute("data-photo-morph-state", "open");
  await viewer.getByRole("button", { name: "2배 확대", exact: true }).click();
  const beforeZoomedClose = (await photoMorphCalls(page)).length;
  await viewer.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(viewer).toHaveCount(0);
  expect((await photoMorphCalls(page)).length, "zoomed photos fade away without jumping to fit before close").toBe(beforeZoomedClose);
  expect(await page.evaluate(() => (window as typeof window & { photoLayerFades: number }).photoLayerFades)).toBe(5);
  await expand.click();
  await expect(viewer).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:clear-private-view")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  await card.click();
  await expect(detail).toBeVisible();
  await expect(expand).toBeVisible();
  expect(errors).toEqual([]);
});

test("photo morph respects reduced motion, stored pause and hidden tabs without trapping a private image", async ({ page }) => {
  await fixture(page, 320);
  await recordPhotoMorphs(page);
  await page.locator("[data-customer-recent-card]").first().click();
  const detail = page.getByRole("dialog", { name: "강은유통", exact: true });
  const expand = detail.getByRole("button", { name: "강은유통 전경사진 크게 보기", exact: true });
  const viewer = page.getByRole("dialog", { name: "강은유통 전경사진", exact: true });
  for (const condition of ["reduced", "paused", "hidden"]) {
    if (condition === "paused") {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture:motion-paused", { detail: true })));
    } else if (condition === "hidden") {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("fixture:motion-paused", { detail: false }));
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    await expand.click();
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("[data-photo-morph-stage]")).toHaveAttribute("data-photo-morph-state", "open");
    await viewer.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(viewer).toHaveCount(0);
    await expect(expand).toBeFocused();
    expect(await photoMorphCalls(page), condition).toEqual([]);
  }
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expand.click();
  await expect(viewer).toBeVisible();
  await expect.poll(async () => (await photoMorphCalls(page)).length).toBeGreaterThan(0);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(viewer.locator("[data-photo-morph-stage]")).toHaveAttribute("data-photo-morph-state", "open");
  expect(await viewer.locator("[data-photo-morph-stage]").evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(detail).toBeVisible();
});

test("three nested directory detail and photo layers consume Back one at a time", async ({ page }) => {
  await fixture(page, 320, "directory");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const directory = page.getByRole("dialog", { name: "거래처 전체보기", exact: true });
  const select = directory.getByRole("button", { name: "거래처 01 상세 정보", exact: true });
  await select.click();
  const detail = page.getByRole("dialog", { name: "거래처 01", exact: true });
  const expand = detail.getByRole("button", { name: "거래처 01 전경사진 크게 보기", exact: true });
  await expand.click();
  const viewer = page.getByRole("dialog", { name: "거래처 01 전경사진", exact: true });
  await expect(viewer).toBeVisible();
  await page.goBack();
  await expect(viewer).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(expand).toBeFocused();
  await page.goBack();
  await expect(detail).toHaveCount(0);
  await expect(directory).toBeVisible();
  await expect(select).toBeFocused();
  await page.goBack();
  await expect(directory).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전체보기 열기", exact: true })).toBeVisible();
});

test("school photo morph keeps gallery navigation, zoom, Back focus and unmount cleanup accessible", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await fixture(page, 390, "school-photos");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await recordPhotoMorphs(page);
  const expand = page.getByRole("button", { name: "학교 정문 크게 보기", exact: true });
  await expect(expand.getByRole("img")).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1_000);
  await expand.click();
  await page.clock.runFor(120);
  const viewer = page.getByRole("dialog", { name: "현장 사진 크게 보기", exact: true });
  const stage = viewer.locator("[data-photo-morph-stage]");
  await expect(viewer.getByRole("img", { name: "학교 정문", exact: true })).toBeVisible();
  await page.clock.runFor(32);
  await expect.poll(async () => (await photoMorphCalls(page)).length).toBeGreaterThan(0);
  await captureMorphMidpoint(page, `output/playwright/customer-presentation/morph-school-midpoint-${info.project.name}.png`, expand);
  await expect(stage).toHaveAttribute("data-photo-morph-state", "open");
  await expect(stage).toHaveCSS("touch-action", "none");
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByRole("img", { name: "급식실 출입구", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByRole("img", { name: "학교 정문", exact: true })).toBeVisible();
  await viewer.getByRole("button", { name: "원본 확대", exact: true }).click();
  await expect(stage).toHaveAttribute("data-zoomed", "true");
  await expect(stage).toHaveCSS("touch-action", /^(?:manipulation|pan-x pan-y pinch-zoom)$/);
  await expect.poll(() => stage.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await viewer.getByRole("button", { name: "크기 복귀", exact: true }).click();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    expect(await viewer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer:modal").analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/playwright/customer-presentation/morph-school-${info.project.name}.png` });
  await expect(stage).toHaveAttribute("data-photo-morph-state", "open");
  await capturePhotoClose(page, viewer, `output/playwright/customer-presentation/morph-school-close-${info.project.name}.png`, () => page.goBack());
  await expect(viewer).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { photoCloseResetFrames: string[] }).photoCloseResetFrames)).toEqual([]);
  await expect(expand).toBeFocused();
  await expand.click();
  await expect(viewer).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:clear-private-view")));
  await expect(viewer).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  await page.getByRole("button", { name: "사진 다시 표시", exact: true }).click();
  await expect(expand.getByRole("img")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const before = (await photoMorphCalls(page)).length;
  await expand.click();
  await expect(viewer).toBeVisible();
  await expect(stage).toHaveAttribute("data-photo-morph-state", "open");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  expect((await photoMorphCalls(page)).length).toBe(before);
  await expect(expand).toBeFocused();
  expect(errors).toEqual([]);
});

test("delivery school details use one compact briefing with distinct school levels and unobscured photo actions", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page, 390, "school-detail");
  const detail = page.locator(".school-detail");
  await expect(detail.getByRole("heading", { level: 1 })).toHaveText("대전온누리초등학교");
  const icons: string[] = [];
  for (const level of ["elementary", "middle", "high"]) {
    await page.getByRole("combobox", { name: "검증 학교급", exact: true }).selectOption(level);
    const mark = detail.locator(`[data-school-type='${level}'] svg`);
    await expect(mark).toHaveCount(1);
    icons.push(await mark.innerHTML());
    await expect(detail.getByRole("heading", { level: 1 }).locator("..")).not.toContainText("서구 ·");
    await expect(detail.getByText("학교 기본 정보", { exact: true })).toHaveCount(0);
    await expect(detail.getByText("학교 코드", { exact: true })).toHaveCount(0);
  }
  expect(new Set(icons).size).toBe(3);
  await page.getByRole("combobox", { name: "검증 학교급", exact: true }).selectOption("elementary");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 840 });
    const brief = detail.locator("[data-delivery-brief]");
    await expect(brief).toHaveCount(1);
    expect(await brief.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeLessThanOrEqual(18);
    for (const value of ["07:30", "08:00", "급식동", "파란 출입문", "출입문은 배송 후 닫아주세요."]) await expect(brief).toContainText(value);
    for (const retired of ["계단 이동", "차량과 하역", "차량 진입", "주차", "하역 위치"]) await expect(brief.getByText(retired, { exact: true })).toHaveCount(0);
    await expect(detail.getByText(/개 슬롯 비어 있음/)).toHaveCount(0);
    const photo = detail.locator(".photo-card[data-empty='false']").first();
    const image = photo.locator("img");
    await expect(image).toBeVisible();
    const imageBounds = (await image.boundingBox())!;
    for (const action of ["크게 보기", "사진 교체", "사진 삭제"]) {
      const button = photo.locator(".photo-card__actions").getByRole("button", { name: new RegExp(`${action}$`) });
      const bounds = (await button.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(imageBounds.y + imageBounds.height - 1);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const captionBounds = (await photo.getByRole("heading", { level: 3 }).boundingBox())!;
    expect(captionBounds.y).toBeGreaterThanOrEqual(imageBounds.y + imageBounds.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-presentation/delivery-school-${width}-${info.project.name}.png`, fullPage: true });
  }
  const photoExpand = detail.locator(".photo-card[data-empty='false'] .photo-card__actions").getByRole("button", { name: /크게 보기$/ });
  await photoExpand.click();
  const viewer = page.getByRole("dialog", { name: "현장 사진 크게 보기", exact: true });
  await expect(viewer.getByRole("img", { name: "학교 정문", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(photoExpand).toBeFocused();
  await page.getByRole("button", { name: "조회 전용으로 전환", exact: true }).click();
  await expect(detail.locator("[data-delivery-brief]").getByRole("button")).toHaveCount(0);
  await expect(detail.getByRole("button", { name: /사진 교체$/ })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: /사진 삭제$/ })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "정보 수정", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "미등록 상태로 전환", exact: true }).click();
  await expect(detail.getByText("검수시간과 급식실 위치를 아직 등록하지 않았어요.", { exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "현장정보 등록", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "편집 권한 켜기", exact: true }).click();
  await detail.getByRole("button", { name: "현장정보 등록", exact: true }).click();
  const registration = page.getByRole("dialog");
  await expect(registration.getByLabel("건물", { exact: true })).toHaveValue("");
  await expect(registration.getByRole("combobox", { name: "대차 필요", exact: true })).toHaveValue("unknown");
  await page.keyboard.press("Escape");
  await expect(registration).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("delivery profile editing saves visible information, retains retired data and preserves a failed draft", async ({ page }) => {
  await fixture(page, 320, "school-detail");
  const detail = page.locator(".school-detail");
  await expect(detail.getByRole("heading", { level: 1 })).toBeVisible();
  await detail.locator("[data-delivery-brief]").getByRole("button", { name: "정보 수정", exact: true }).click();
  const editor = page.getByRole("dialog");
  await expect(editor).toBeVisible();
  for (const retired of ["계단 이동", "차량 진입", "주차", "하역 위치", "차량 참고"]) await expect(editor.getByLabel(retired, { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel("건물", { exact: true })).toHaveValue("급식동");
  await editor.getByLabel("건물", { exact: true }).fill("신관");
  await editor.getByLabel("검수 시작", { exact: true }).fill("07:40");
  await editor.getByRole("combobox", { name: "대차 필요", exact: true }).selectOption("notRequired");
  await page.evaluate(() => { const fixture = (window as typeof window & { schoolDetailFixture: SchoolDetailFixtureState }).schoolDetailFixture; fixture.holdSave = true; fixture.rejectSave = true; });
  await editor.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await expect(editor.getByRole("button", { name: "저장 중…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await page.evaluate(() => (window as typeof window & { schoolDetailFixture: SchoolDetailFixtureState }).schoolDetailFixture.releaseSave?.());
  await expect(editor.getByRole("alert")).toContainText("작성 내용은 유지됩니다");
  await expect(editor.getByLabel("건물", { exact: true })).toHaveValue("신관");
  await page.evaluate(() => { const fixture = (window as typeof window & { schoolDetailFixture: SchoolDetailFixtureState }).schoolDetailFixture; fixture.holdSave = false; fixture.rejectSave = false; });
  await editor.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await page.evaluate(() => { const fixture = (window as typeof window & { schoolDetailFixture: SchoolDetailFixtureState }).schoolDetailFixture; return { requests: fixture.saves, profile: fixture.profile }; });
  expect(saved.requests).toHaveLength(2);
  expect(saved.requests[1]).toMatchObject({ schoolId: "SYNTHETIC-SCHOOL", expectedRevision: 7, patch: { cafeteria: { building: "신관" }, inspection: { startTime: "07:40" }, equipment: { cartRequired: "notRequired", stairsRequired: "required" } } });
  expect(saved.requests[1]?.patch.vehicle).toBeUndefined();
  expect(saved.profile?.vehicle).toEqual({ access: "limited", unloadingLocation: "보존해야 하는 기존 하역정보", parking: "unavailable", note: "보존해야 하는 기존 차량정보" });
  expect(saved.profile?.equipment.stairsRequired).toBe("required");
  await expect(detail.locator("[data-delivery-brief]")).toContainText("신관");
  await expect(detail.locator("[data-delivery-brief]")).toContainText("07:40");
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
});

test("sales detail has a warm layered palette and shared cafeteria location without delivery-only information", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page, 390, "sales-detail");
  const detail = page.locator(".school-detail");
  const location = detail.locator("[data-sales-location-brief]");
  await expect(location).toBeVisible();
  await expect(detail.locator(".sales-history")).toBeVisible();
  await expect(detail.locator(".sales-collaboration")).toBeVisible();
  const order = await detail.evaluate((element) => [...element.querySelectorAll(".sales-school-brief,.sales-contact-brief,.sales-history,[data-sales-location-brief],.school-photo-gallery,.sales-collaboration")].map((section) => section.hasAttribute("data-sales-location-brief") ? "location" : section.classList[0]));
  expect(order).toEqual(["sales-school-brief", "sales-contact-brief", "sales-history", "location", "school-photo-gallery", "sales-collaboration"]);
  await expect(location.getByRole("heading", { name: "급식실 위치", exact: true })).toHaveCount(1);
  for (const phrase of ["급식동", "1층", "정문에서 오른쪽 건물", "파란 출입문", "운동장 바깥 통로 이용"]) await expect(location).toContainText(phrase);
  await expect(location.locator("[data-field-elevator]")).toHaveText("엘리베이터있음");
  for (const forbidden of ["대차", "검수시간", "차량", "계단", "하역", "주차"]) await expect(location).not.toContainText(forbidden);
  await expect(detail.locator("[data-delivery-brief]")).toHaveCount(0);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 840 });
    const quickBar = detail.getByRole("complementary", { name: "학교 빠른 작업", exact: true });
    const visitLabel = quickBar.getByRole("button", { name: "방문기록", exact: true }).locator("span");
    if (width === 320) await expect(visitLabel).toHaveCSS("white-space", "nowrap");
    expect(await visitLabel.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; })).toBe(1);
    const quickTargets = await quickBar.locator("a,button").evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height, fits: element.scrollWidth <= element.clientWidth }; }));
    for (const target of quickTargets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.fits).toBe(true);
    }
    for (const target of [page.locator(".aurora-background"), detail.locator(".sales-school-brief"), location]) {
      const background = await target.evaluate((element) => getComputedStyle(element).backgroundImage);
      expect(background).toContain("gradient(");
      const colors = [...new Set(background.match(/(?:rgba?|color)\([^)]*\)/g) ?? [])].filter((color) => !/255[, ]+255[, ]+255|srgb 1 1 1(?:[ /)]|$)/.test(color));
      expect(colors.length, `at least two non-white tints at ${width}px: ${background}`).toBeGreaterThanOrEqual(2);
      const tintOpacities = [...background.split("linear-gradient")[0]!.matchAll(/(?:rgba|color)\([^)]*[,/]\s*([\d.]+)\)/g)].map((match) => Number(match[1])).filter((alpha) => alpha > 0);
      expect(tintOpacities.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...tintOpacities), "quiet radial tints keep attention on the content").toBeLessThanOrEqual(await target.evaluate((element) => element.classList.contains("aurora-background") ? .16 : .1));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-presentation/sales-school-${width}-${info.project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "배정 정보 없이 보기", exact: true }).click();
  await expect(detail.locator(".sales-school-brief")).toHaveCount(0);
  await expect(detail.locator(".sales-history")).toHaveCount(0);
  await expect(location).toContainText("정문에서 오른쪽 건물");
  for (const [elevator, label] of [["unknown", "미확인"], ["unavailable", "없음"], ["available", "있음"]] as const) {
    await page.evaluate((value) => {
      const fixture = (window as typeof window & { schoolDetailFixture: SchoolDetailFixtureState }).schoolDetailFixture;
      fixture.profile = { ...fixture.profile!, equipment: { ...fixture.profile!.equipment, elevator: value } };
      window.dispatchEvent(new Event("fixture:detail-changed"));
    }, elevator);
    await expect(location.locator("[data-field-elevator] dd")).toHaveText(label);
  }
  await page.evaluate(() => {
    const fixture = (window as typeof window & { schoolDetailFixture: SchoolDetailFixtureState }).schoolDetailFixture;
    fixture.profile = { ...fixture.profile!, cafeteria: { building: null, floor: null, locationDescription: "새로 확인한 별관 출입구\n안쪽 복도에서 오른쪽", entranceDescription: null, routeDescription: null } };
    window.dispatchEvent(new Event("fixture:detail-changed"));
  });
  const descriptionOnly = location.locator("[data-field-location] > strong");
  await expect(descriptionOnly).toHaveText("새로 확인한 별관 출입구\n안쪽 복도에서 오른쪽");
  await expect(descriptionOnly).toHaveCSS("white-space", "pre-wrap");
  await expect(location.getByText("새로 확인한 별관 출입구 안쪽 복도에서 오른쪽", { exact: true })).toHaveCount(1);
  await expect(location).not.toContainText("정문에서 오른쪽 건물");
  await page.getByRole("button", { name: "미등록 상태로 전환", exact: true }).click();
  await expect(location).toContainText("위치 미등록");
  await expect(location.locator("[data-field-elevator] dd")).toHaveText("미확인");
  await expect(location).not.toContainText("없음");
  await page.getByRole("button", { name: "조회 전용으로 전환", exact: true }).click();
  await expect(location.getByRole("button", { name: "위치 수정", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "연락처 없이 보기", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 840 });
  const readOnlyBar = detail.getByRole("complementary", { name: "학교 빠른 작업", exact: true });
  for (const name of ["연락처 없음", "조회 전용"]) {
    const button = readOnlyBar.getByRole("button", { name, exact: true });
    await expect(button).toBeDisabled();
    const dimensions = await button.evaluate((element) => { const rect = element.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(element.querySelector("span")!); return { width: rect.width, height: rect.height, fits: element.scrollWidth <= element.clientWidth, lines: range.getClientRects().length }; });
    expect(dimensions).toMatchObject({ fits: true, lines: 1 });
    expect(dimensions.width).toBeGreaterThanOrEqual(44);
    expect(dimensions.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("sales location edits update shared information while preserving cart stairs inspection and delivery styling", async ({ page }) => {
  await fixture(page, 320, "sales-detail");
  const location = page.locator("[data-sales-location-brief]");
  await location.getByRole("button", { name: "위치 수정", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "급식실 위치 수정", exact: true });
  await expect(editor).toBeVisible();
  for (const forbidden of ["대차", "검수", "차량", "계단", "주차", "현장 특이사항"]) await expect(editor).not.toContainText(forbidden);
  await editor.getByLabel("건물", { exact: true }).fill("새 급식동");
  await editor.getByRole("textbox", { name: "출입구", exact: true }).fill("엘리베이터 옆 출입문");
  await editor.getByRole("combobox", { name: "엘리베이터", exact: true }).selectOption("unavailable");
  await editor.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await page.evaluate(() => { const fixture = (window as typeof window & { schoolDetailFixture: SchoolDetailFixtureState }).schoolDetailFixture; return { request: fixture.saves[0], profile: fixture.profile }; });
  expect(Object.keys(saved.request!.patch).sort()).toEqual(["cafeteria", "equipment"]);
  expect(saved.request).toMatchObject({ expectedRevision: 7, patch: { cafeteria: { building: "새 급식동", entranceDescription: "엘리베이터 옆 출입문" }, equipment: { elevator: "unavailable", cartRequired: "required", stairsRequired: "required" } } });
  expect(saved.profile?.inspection).toEqual({ startTime: "07:30", endTime: "08:00", note: "교직원 출근 전 검수" });
  expect(saved.profile?.vehicle.note).toBe("보존해야 하는 기존 차량정보");
  await expect(location).toContainText("새 급식동");
  await expect(location.locator("[data-field-elevator] dd")).toHaveText("없음");
  const salesBackground = await page.locator(".aurora-background").evaluate((element) => getComputedStyle(element).backgroundImage);
  await page.getByRole("button", { name: "학교납품으로 전환", exact: true }).click();
  const delivery = page.locator("[data-delivery-brief]");
  await expect(delivery).toContainText("07:30 – 08:00");
  await expect(delivery).toContainText("대차필요");
  await expect(delivery).toContainText("새 급식동");
  await expect(delivery).toContainText("엘리베이터없음");
  expect(await delivery.getByText("07:30 – 08:00", { exact: true }).evaluate((element) => getComputedStyle(element).color)).toBe("rgb(27, 100, 218)");
  const deliveryBackground = await page.locator(".aurora-background").evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(deliveryBackground).not.toBe(salesBackground);
  expect(deliveryBackground).toContain("rgba(174, 223, 205, 0.22)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 390]) {
  test(`${width}px directory supports forty customers, region filtering and returns from detail without losing selection`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixture(page, width, "directory");
    const directory = page.getByRole("dialog", { name: "거래처 전체보기", exact: true });
    const cards = directory.locator("[data-customer-card]");
    await expect(cards).toHaveCount(32);
    await expectPasswordSummary(cards.first(), cards.first().getByRole("button", { name: /상세 정보$/ }), "0012*");
    const more = directory.getByRole("button", { name: /거래처 더 보기/ });
    await more.click();
    await expect(cards).toHaveCount(40);
    const footer = directory.getByRole("button", { name: "지역·행정동 선택", exact: true });
    await expect(footer).toBeVisible();
    await footer.click();
    await expect(directory.getByRole("button", { name: /대전광역시 서구/ })).toBeVisible();
    await directory.getByRole("button", { name: /대전광역시 서구/ }).click();
    await expect(cards).toHaveCount(20);
    const dong = directory.getByRole("combobox", { name: "행정동", exact: true });
    await expect(dong.locator('option[value="둔산1동"]')).toHaveText("둔산1동 (10)");
    await dong.selectOption("둔산1동");
    await expect(cards).toHaveCount(10);
    const query = directory.getByRole("searchbox", { name: "전체 거래처에서 이름 검색", exact: true });
    await expect(query).toHaveAttribute("autocomplete", "off");
    await query.fill("거래처 01");
    await expect(cards).toHaveCount(1);
    await expect(cards.first().getByRole("link", { name: "거래처 01 납품지 길안내", exact: true })).toHaveAttribute("href", /map\.kakao\.com/);
    await expect(cards.first().getByRole("link", { name: "거래처 01 김소은 부장 전화", exact: true })).toHaveAttribute("href", "tel:01012345678");
    await cards.first().getByRole("button", { name: "거래처 01 상세 정보", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "거래처 01", exact: true });
    await expect(detail.getByRole("button", { name: "거래처 01 전경사진 크게 보기" })).toBeVisible();
    await detail.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(directory).toBeVisible();
    await expect(dong).toHaveValue("둔산1동");
    await expect(query).toHaveValue("거래처 01");
    await expect(cards).toHaveCount(1);
    await directory.getByRole("button", { name: "선택 초기화", exact: true }).click();
    await expect(cards).toHaveCount(32);
    await expect(dong).toHaveValue("");
    expect(await directory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer:modal").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-presentation/directory-${width}-${info.project.name}.png` });
    await page.addStyleTag({ content: "html{font-size:200%}" });
    expect(await directory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expectPasswordSummary(cards.first(), cards.first().getByRole("button", { name: /상세 정보$/ }), "0012*");
    await page.emulateMedia({ forcedColors: "active" });
    await page.keyboard.press("Tab");
    await footer.focus();
    await expect(footer).toBeFocused();
    await expect(footer).toHaveCSS("outline-style", "solid");
    await page.goto("about:blank");
    await page.emulateMedia({ forcedColors: "none" });
    await fixture(page, width, "directory", "long");
    const longDirectory = page.getByRole("dialog", { name: "거래처 전체보기", exact: true });
    const longCards = longDirectory.locator("[data-customer-card]");
    await expect(longCards).toHaveCount(32);
    await expectPasswordSummary(longCards.first(), longCards.first().getByRole("button", { name: /상세 정보$/ }), longPassword);
    await expect(longCards.first().locator("[data-customer-password-summary] strong > *")).toHaveCount(0);
    await page.addStyleTag({ content: "html{font-size:200%}" });
    await expectPasswordSummary(longCards.first(), longCards.first().getByRole("button", { name: /상세 정보$/ }), longPassword);
    expect(await longCards.evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
    expect(await longDirectory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer:modal").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-presentation/directory-password-200-${width}-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });
  test(`${width}px recent five has compact targets, photo/fallback states and readable address`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixture(page, width);
    const rows = page.locator("[data-customer-recent-card]");
    await expect(rows.nth(0).locator('[data-customer-photo="ready"] img')).toBeVisible();
    await expect(rows.nth(1).locator('[data-customer-photo="error"] svg')).toBeVisible();
    await expect(rows.nth(2).locator('[data-customer-photo="placeholder"] svg')).toBeVisible();
    await expectPasswordSummary(rows.first(), rows.first(), "0012*");
    const invalidCardSizes = await rows.evaluateAll((elements) => elements.map((element, index) => ({ index, height: element.getBoundingClientRect().height, width: element.clientWidth, scrollWidth: element.scrollWidth })).filter((value) => value.height < 44 || value.height > 130 || value.scrollWidth > value.width));
    expect(invalidCardSizes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-presentation/recent-${width}-${info.project.name}.png`, fullPage: true });
    await rows.nth(0).click();
    const sheet = page.getByRole("dialog", { name: "강은유통", exact: true });
    const image = sheet.getByRole("img", { name: "강은유통 전경 사진", exact: true });
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect(sheet.getByRole("link", { name: "강은유통 김소은 부장 바로 전화", exact: true })).toBeVisible();
    expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-presentation/detail-${width}-${info.project.name}.png` });
    await page.goto("about:blank");
    await fixture(page, width, "presentation", "long");
    const longRows = page.locator("[data-customer-recent-card]");
    await expectPasswordSummary(longRows.first(), longRows.first(), longPassword);
    await expect(longRows.first().locator("[data-customer-password-summary] strong > *")).toHaveCount(0);
    expect(await longRows.first().locator("[data-customer-password-summary] strong").evaluate((element) => element.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(element).lineHeight))).toBe(true);
    await page.addStyleTag({ content: "html{font-size:200%}" });
    await expectPasswordSummary(longRows.first(), longRows.first(), longPassword);
    const nameBounds = await longRows.first().getByText("강은유통", { exact: true }).boundingBox();
    const badgeBounds = await longRows.first().getByText("정보변경", { exact: true }).boundingBox();
    expect(nameBounds).not.toBeNull();
    expect(badgeBounds).not.toBeNull();
    const overlap = nameBounds && badgeBounds && nameBounds.x < badgeBounds.x + badgeBounds.width && nameBounds.x + nameBounds.width > badgeBounds.x && nameBounds.y < badgeBounds.y + badgeBounds.height && nameBounds.y + nameBounds.height > badgeBounds.y;
    expect(overlap, JSON.stringify({ nameBounds, badgeBounds })).toBe(false);
    expect(await longRows.evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-presentation/recent-password-200-${width}-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });
}

for (const width of [360, 412, 768, 1280]) {
  test(`${width}px renewal audit keeps recent and directory rows within the viewport`, async ({ page }) => {
    const output = "output/playwright/ui-renewal/after";
    mkdirSync(output, { recursive: true });
    await fixture(page, width);
    const rows = page.locator("[data-customer-recent-card]");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await rows.evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 48 && item.scrollWidth <= item.clientWidth))).toBe(true);
    const recent = await page.evaluate(() => ({ firstRowTop: document.querySelector("[data-customer-recent-card]")!.getBoundingClientRect().top, firstRowHeight: document.querySelector("[data-customer-recent-card]")!.getBoundingClientRect().height, visibleRows: [...document.querySelectorAll("[data-customer-recent-card]")].filter((item) => item.getBoundingClientRect().top < innerHeight).length }));
    await page.screenshot({ path: `${output}/recent-${width}.png` });
    await page.goto("about:blank");
    await fixture(page, width, "directory");
    const directory = page.getByRole("dialog", { name: "거래처 전체보기", exact: true });
    const cards = directory.locator("[data-customer-card]");
    await expect(cards).toHaveCount(32);
    expect(await directory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const listing = await directory.evaluate((element) => ({ firstRowTop: element.querySelector("[data-customer-card]")!.getBoundingClientRect().top, firstRowHeight: element.querySelector("[data-customer-card]")!.getBoundingClientRect().height, visibleRows: [...element.querySelectorAll("[data-customer-card]")].filter((item) => item.getBoundingClientRect().top < innerHeight - 48).length }));
    await page.screenshot({ path: `${output}/directory-${width}.png` });
    if (width === 412) {
      await page.addStyleTag({ content: "html{font-size:200%}" });
      expect(await directory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: `${output}/directory-200-${width}.png` });
    }
    writeFileSync(`${output}/listing-metrics-${width}.json`, JSON.stringify({ width, recent, directory: listing }, null, 2));
  });
}

test("photo failure exposes a 44px retry in detail; reduced motion keeps placeholders still", async ({ page }) => {
  await fixture(page, 320);
  await page.getByRole("button", { name: "매일식품 다시 열기", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "매일식품", exact: true });
  const preview = sheet.locator("[data-customer-photo]");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute("data-customer-photo", "error");
  await expect(preview.getByRole("status")).toHaveText("사진을 불러오지 못했어요.");
  const retry = preview.getByRole("button", { name: "다시 불러오기", exact: true });
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await retry.click();
  await expect(preview).toHaveAttribute("data-customer-photo", "loading");
  await expect(preview).toHaveAttribute("data-customer-photo", "error");
  expect(await preview.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect((await new AxeBuilder({ page }).include(".bottom-sheet-layer").analyze()).violations).toEqual([]);
});

test("offline clears private images and reconnect loads a fresh URL; 200% text keeps names readable", async ({ page, context }) => {
  await fixture(page, 320);
  const first = page.locator("[data-customer-recent-card]").first();
  const image = first.locator("img");
  await expect(image).toBeVisible();
  const previous = await image.getAttribute("src");
  await context.setOffline(true);
  await expect(image).toHaveCount(0);
  await expect(first.locator("[data-customer-photo]")).toHaveAttribute("data-customer-photo", "placeholder");
  await context.setOffline(false);
  await expect(image).toBeVisible();
  expect(await image.getAttribute("src")).not.toBe(previous);
  await page.addStyleTag({ content: "html{font-size:200%}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(first.getByText("강은유통", { exact: true })).toBeVisible();
  await page.emulateMedia({ forcedColors: "active" });
  await first.focus();
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS("outline-style", "solid");
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});
