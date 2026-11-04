import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { SourceMap } from "node:module";
import { cpus, loadavg } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { build, type Plugin } from "esbuild";
import type { CardUpdateMeasurement } from "../tests/e2e/fixtures/inventory-card-update-data";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "output/playwright/inventory-card-update", new Date().toISOString().replaceAll(/[:.]/g, "-"));
await mkdir(output, { recursive: true });
const workspacePath = resolve(root, "src/features/inventory/inventory-workspace.tsx");
const cardPath = resolve(root, "src/features/inventory/inventory-card.tsx");
let workspaceSource = await readFile(workspacePath, "utf8");
let cardSource = await readFile(cardPath, "utf8");
const data = JSON.stringify(resolve(root, "tests/e2e/fixtures/inventory-card-update-data.tsx"));
const repeats = Number(process.env.INVENTORY_CARD_REPEATS ?? 7);
assert(Number.isInteger(repeats) && repeats >= 5 && repeats <= 30);
const cpuRate = Number(process.env.INVENTORY_CARD_CPU_RATE ?? 4);
assert(Number.isFinite(cpuRate) && cpuRate >= 1 && cpuRate <= 8);

const oldCallback = `const openProduct = useCallback((productId: string) => {
    const product = products.find((item) => item.productId === productId);
    if (product) setSelected({ productId, location: inventoryOpeningLocation(product, location) });
  }, [products, location]);`;
const newCallback = `const openProduct = useCallback((product: InventoryProduct) => {
    setSelected({ productId: product.productId, location: inventoryOpeningLocation(product, location) });
  }, [location]);`;
function replaceOnce(source: string, before: string, after: string) {
  const normalized = source.replaceAll("\r\n", "\n");
  assert.equal(normalized.split(before).length, 2, `Expected one source match for ${before.slice(0, 80)}`);
  return normalized.replace(before, after);
}
if (workspaceSource.replaceAll("\r\n", "\n").includes(newCallback)) {
  workspaceSource = replaceOnce(workspaceSource, newCallback, oldCallback);
  cardSource = replaceOnce(replaceOnce(cardSource, "onOpen: (product: InventoryProduct) => void", "onOpen: (productId: string) => void"),
    "onClick={() => onOpen(product)}", "onClick={() => onOpen(product.productId)}");
}
const candidateWorkspace = replaceOnce(workspaceSource, oldCallback, newCallback);
const candidateCard = replaceOnce(replaceOnce(cardSource, "onOpen: (productId: string) => void", "onOpen: (product: InventoryProduct) => void"),
  "onClick={() => onOpen(product.productId)}", "onClick={() => onOpen(product)}");

async function bundle(candidate: boolean) {
  const plugin: Plugin = { name: "inventory-card-update-isolation", setup(builder) {
    builder.onLoad({ filter: /inventory-workspace\.tsx$/ }, () => ({ contents: candidate ? candidateWorkspace : workspaceSource, loader: "tsx", resolveDir: dirname(workspacePath) }));
    builder.onLoad({ filter: /inventory-card\.tsx$/ }, () => ({
      contents: replaceOnce(candidate ? candidateCard : cardSource, "const statusId = useId();", "globalThis.__inventoryCardMetrics.cardRenders += 1; const statusId = useId();"),
      loader: "tsx", resolveDir: dirname(cardPath),
    }));
    builder.onResolve({ filter: /inventory-repository$|inventory-detail$|inventory-forms$|inventory-editor-loader$|^client-only$|firebase\/client$/ }, args => ({ path: args.path, namespace: "card-update-isolated" }));
    builder.onLoad({ filter: /.*/, namespace: "card-update-isolated" }, ({ path }) => ({ loader: "tsx", resolveDir: root,
      contents: path.endsWith("inventory-repository") ? `export { inventoryRepository, inventoryErrorMessage } from ${data};` :
        path.endsWith("inventory-detail") ? `export { InventoryDetail } from ${data};` :
        path.endsWith("inventory-forms") ? "export function InventoryProductEditor(){return null} export function InventorySettingsForm(){return null}" :
        path.endsWith("inventory-editor-loader") ? "export const scheduleInventoryProductEditorPreload=()=>()=>{}" :
        path.endsWith("firebase/client") ? "export function getFirebaseClientServices(){throw Error('Network boundary disabled')}" : "",
    }));
  } };
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/inventory-card-update.tsx"], outfile: "fixture.js",
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", minify: true, keepNames: true, sourcemap: "inline",
    define: { "process.env.NODE_ENV": '"production"' }, plugins: [plugin], logLevel: "silent" });
  return { js: result.outputFiles.find(file => file.path.endsWith(".js"))!.text, css: result.outputFiles.find(file => file.path.endsWith(".css"))!.text };
}
const builds = { baseline: await bundle(false), candidate: await bundle(true) };
for (const variant of ["baseline", "candidate"] as const) await writeFile(resolve(output, `${variant}.js`), builds[variant].js);
const publicRoot = resolve(root, "public");
const failures: string[] = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data: blob:; object-src 'none'");
  response.setHeader("Cache-Control", "no-store");
  const variant = url.pathname.startsWith("/candidate") ? "candidate" : "baseline";
  if (url.pathname.endsWith(".js")) { response.setHeader("Content-Type", "application/javascript"); response.end(builds[variant].js); return; }
  if (url.pathname === "/baseline" || url.pathname === "/candidate") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inventory card update fixture</title><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui;background:white;color:#243b55}button,input{font:inherit}${builds[variant].css}</style><div id="root"></div><script src="/${variant}.js"></script></html>`);
    return;
  }
  if (url.pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
  const asset = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
  if (!asset.startsWith(publicRoot + sep)) { response.writeHead(403).end(); return; }
  try { const content = await readFile(asset); response.setHeader("Content-Type", ({ ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" } as Record<string, string>)[extname(asset)] ?? "application/octet-stream"); response.end(content); }
  catch { response.writeHead(404).end(); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
type Sample = CardUpdateMeasurement & { count: number; variant: "baseline" | "candidate"; iteration: number };
const samples: Sample[] = [];
async function commit(page: Page) {
  const previous = await page.evaluate(() => globalThis.__inventoryCardMetrics.completed);
  await page.getByTestId("commit-one-product").click();
  await page.waitForFunction(expected => globalThis.__inventoryCardMetrics.completed === expected, previous + 1);
  const sample = await page.evaluate(() => globalThis.__inventoryCardMetrics.samples.at(-1)!);
  assert.equal(sample.quantity, sample.stockRevision);
  assert.equal(await page.getByRole("button", { name: `가상 품목 0001, ${sample.quantity} 봉, 상세 보기`, exact: true }).count(), 1);
  return sample;
}
async function createPage(variant: "baseline" | "candidate", count: number) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: "block" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("requestfailed", request => failures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
  page.on("response", response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${response.url()}`); });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  await page.goto(`${origin}/${variant}?count=${count}`);
  await page.waitForFunction(total => document.querySelectorAll("li[role=listitem]").length === total, count);
  await page.getByRole("button", { name: "가상 품목 0001, 1 봉, 상세 보기", exact: true }).click();
  await page.getByTestId("commit-one-product").waitFor();
  for (let warmup = 0; warmup < 3; warmup++) await commit(page);
  return { context, page, cdp };
}
const environment = { cpu: cpus()[0]?.model, logicalCores: cpus().length, loadAverage: loadavg(), browser: browser.version(), node: process.version };
try {
  for (const count of [60, 300]) {
    const baseline = await createPage("baseline", count);
    const candidate = await createPage("candidate", count);
    try {
      for (let iteration = 0; iteration < repeats; iteration++) {
        for (const variant of ["baseline", "candidate"] as const) {
          const session = variant === "baseline" ? baseline : candidate;
          await session.page.bringToFront();
          await session.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
          const sample = await commit(session.page);
          assert.equal(sample.cardRenders, variant === "baseline" ? count : 1);
          samples.push({ ...sample, count, variant, iteration });
        }
      }
      await candidate.page.screenshot({ path: resolve(output, `candidate-${count}.png`), fullPage: false });
    } finally { await baseline.context.close(); await candidate.context.close(); }
  }
  for (const variant of ["baseline", "candidate"] as const) {
    const session = await createPage(variant, 300);
    try {
      await session.cdp.send("Profiler.enable");
      await session.cdp.send("Profiler.start");
      await session.page.evaluate(async () => {
        const button = document.querySelector<HTMLButtonElement>('[data-testid="commit-one-product"]')!;
        for (let index = 0; index < 20; index++) {
          const expected = globalThis.__inventoryCardMetrics.completed + 1;
          button.click();
          const deadline = performance.now() + 5_000;
          while (globalThis.__inventoryCardMetrics.completed < expected) {
            if (performance.now() > deadline) throw new Error("Profile update did not complete");
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          }
        }
      });
      const { profile } = await session.cdp.send("Profiler.stop");
      await writeFile(resolve(output, `${variant}.cpuprofile`), JSON.stringify(profile));
      const hits = new Map<number, number>();
      for (const id of profile.samples ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
      const encodedMap = builds[variant].js.match(/sourceMappingURL=data:application\/json;base64,([^\s]+)/)?.[1];
      assert(encodedMap);
      const sourceMap = new SourceMap(JSON.parse(Buffer.from(encodedMap, "base64").toString("utf8")));
      const mapped = profile.nodes.map(node => {
        const entry = node.callFrame.url.endsWith(`/${variant}.js`) ? sourceMap.findEntry(node.callFrame.lineNumber, node.callFrame.columnNumber) : {};
        return { name: node.callFrame.functionName, url: node.callFrame.url, line: node.callFrame.lineNumber + 1,
          originalSource: "originalSource" in entry && typeof entry.originalSource === "string" ? entry.originalSource : undefined,
          originalLine: "originalLine" in entry && typeof entry.originalLine === "number" ? entry.originalLine + 1 : undefined, samples: hits.get(node.id) ?? 0 };
      });
      const bySource = new Map<string, number>();
      for (const node of mapped) { const source = node.originalSource ?? node.name; bySource.set(source, (bySource.get(source) ?? 0) + node.samples); }
      const top = mapped
        .sort((left, right) => right.samples - left.samples).slice(0, 25);
      await writeFile(resolve(output, `${variant}-profile-top.json`), JSON.stringify({ top, bySource: [...bySource].sort((left, right) => right[1] - left[1]) }, null, 2));
    } finally { await session.context.close(); }
  }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const summary = [60, 300].flatMap(count => (["baseline", "candidate"] as const).map(variant => {
    const selected = samples.filter(sample => sample.count === count && sample.variant === variant);
    const stats = (key: "domCommittedMs" | "nextFrameMs") => {
      const values = selected.map(sample => sample[key]).sort((a, b) => a - b);
      return { median: values[Math.floor(values.length / 2)] ?? null, min: values[0] ?? null, max: values.at(-1) ?? null };
    };
    return { count, variant, samples: selected.length, renderCounts: [...new Set(selected.map(sample => sample.cardRenders))], domCommittedMs: stats("domCommittedMs"), nextFrameMs: stats("nextFrameMs") };
  }));
  const report = { environment, method: { repeats, cpuRate, viewport: [412, 915], reactMode: "production", order: "baseline,candidate alternating per catalog size", warmup: "three unreported updates per side; mounted catalog and JS remain warm", measured: "synthetic confirmed-result button handler to changed row DOM; next requestAnimationFrame separately", excluded: "server latency, real device, startup, actual detail form; CPU profiles excluded from timing", decision: "keep only if unchanged cards stop rendering and displayed quantity stays correct; treat timing as inconclusive if spread exceeds effect", sourceSha256: { workspace: createHash("sha256").update(workspaceSource).digest("hex"), card: createHash("sha256").update(cardSource).digest("hex") } }, completedMeasuredUpdates: samples.length, failures, summary, samples };
  await writeFile(resolve(output, "results.json"), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, "baseline-workspace.tsx"), workspaceSource);
  await writeFile(resolve(output, "baseline-card.tsx"), cardSource);
  console.log(JSON.stringify({ output, failures, summary }, null, 2));
}
