import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, posix, resolve, sep } from "node:path";

// Read-only deployment gate. Remote mode touches only public GET/HEAD resources:
// it never signs in, sends cookies, calls a Function, or reads private records.
const root = resolve(import.meta.dirname, "..");
const output = join(root, "out");
const probePath = "/api/connectivity";
const expectedIcons = new Map([
  ["/icons/onnuriway-company-icon-192-v4.png", [192, 192]],
  ["/icons/onnuriway-company-icon-512-v4.png", [512, 512]],
  ["/icons/onnuriway-company-icon-maskable-512-v4.png", [512, 512]],
  ["/icons/onnuriway-company-apple-touch-icon-v4.png", [180, 180]],
  ["/brand/onnuri-food-logo.png", [1200, 446]],
  ["/icon.png", [64, 64]],
]);
const publicFiles = new Set(["/", "/manifest.webmanifest", "/favicon.ico", ...expectedIcons.keys()]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function effectiveHeaders(hosting, pathname) {
  const result = new Map();
  for (const rule of hosting.headers ?? []) {
    check(typeof rule.source === "string", "Hosting header rules must use explicit source globs.");
    if (!posix.matchesGlob(pathname, rule.source)) continue;
    for (const header of rule.headers ?? []) result.set(header.key.toLowerCase(), header.value);
  }
  return result;
}

function assertFresh(headers, pathname, strict = false) {
  const cache = headers.get("cache-control") ?? "";
  check(strict ? /(?:^|,)\s*no-store(?:,|$)/i.test(cache) : /(?:^|,)\s*(?:no-cache|no-store)(?:,|$)/i.test(cache),
    `${pathname} must ${strict ? "disable storage" : "require revalidation"}; found Cache-Control: ${cache || "missing"}.`);
  check(!/immutable/i.test(cache), `${pathname} must not be immutable.`);
}

function assertMime(headers, expression, pathname) {
  check(expression.test(headers.get("content-type") ?? ""), `${pathname} has an unexpected or missing Content-Type.`);
}

function parsePrecache(source) {
  // Parse only the generated data literal, never execute the service worker.
  const literal = source.match(/\bprecacheEntries\s*:\s*(\[[\s\S]*?\])\s*(?:\?\?|,)/u)?.[1];
  check(literal, "Generated service worker has no readable precache manifest.");
  const paths = [...literal.matchAll(/(?:^|[,{])\s*['"]?url['"]?\s*:\s*(['"])(.*?)\1/gu)].map((match) => match[2]);
  check(paths.length > 0, "Generated precache manifest is empty.");
  return [...new Set(paths)];
}

function outputFile(pathname) {
  check(pathname.startsWith("/") && !pathname.startsWith("//") && !/[\\\0]/u.test(pathname), "Invalid public asset path.");
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  check(!decoded.split("/").includes(".."), "Public asset path leaves the export directory.");
  const target = resolve(output, `.${decoded === "/" ? "/index.html" : decoded}`);
  check(target.startsWith(`${output}${sep}`), "Public asset path leaves the export directory.");
  return target;
}

function parseBaseUrl(value) {
  const url = new URL(value);
  check(!url.username && !url.password && !url.search && !url.hash && url.pathname === "/", "--url must be a bare origin without credentials, query, or path.");
  check(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
    "Remote checks require HTTPS; HTTP is allowed only for a local emulator.");
  return url;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyProductionClientBundle(source) {
  // A local emulator build must never be promoted to this production-only site.
  // Inspect public literals only; never print Firebase configuration or keys.
  check(/projectId:["']onnuriway["']/u.test(source)
    && /authDomain:["']onnuriway\.firebaseapp\.com["']/u.test(source),
  "Export does not contain the expected production Firebase project/auth domain.");
  check(!/demo-(?:onnuriway|inventory)[a-z0-9-]*/iu.test(source)
    && !/(?:127\.0\.0\.1|localhost):(?:9099|5001|8080|9199)/u.test(source),
  "Export contains emulator configuration; rebuild against production before deploying.");
}

async function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    check(!entry.isSymbolicLink(), "The static export must not contain symbolic links.");
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await listFiles(join(directory, entry.name), `${name}/`));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

function verifyManifest(manifest) {
  for (const field of ["id", "scope", "start_url"]) check(manifest[field] === "/", `Manifest ${field} must preserve the installed PWA identity (/).`);
  check(manifest.display === "standalone" && manifest.name === "급식길", "Manifest app name or standalone mode changed.");
  check(manifest.icons?.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"), "Manifest needs the 192px installation icon.");
  check(manifest.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"), "Manifest needs the 512px maskable icon.");
  for (const icon of manifest.icons ?? []) check(expectedIcons.has(icon.src), "Manifest contains an unverified installation icon.");
}

async function verifyLocal() {
  const config = JSON.parse(await readFile(join(root, "firebase.json"), "utf8"));
  const candidates = (Array.isArray(config.hosting) ? config.hosting : [config.hosting]).filter(Boolean);
  const hosting = candidates.find((entry) => entry.site === "onnuriway");
  check(hosting?.public === "out" && !hosting.source, "Firebase Hosting must explicitly target site onnuriway with public=out, not a framework server.");
  check(hosting.cleanUrls === true && hosting.trailingSlash === false, "Hosting must retain extension-free URLs without forced trailing slashes.");
  check((hosting.rewrites ?? []).length === 0, "Review Hosting rewrites: this root-only app must not mask missing assets or Firebase reserved auth paths.");
  for (const pathname of ["/", "/index.html", "/manifest.webmanifest"]) assertFresh(effectiveHeaders(hosting, pathname), pathname);
  for (const pathname of ["/sw.js", probePath]) assertFresh(effectiveHeaders(hosting, pathname), pathname, true);
  assertMime(effectiveHeaders(hosting, probePath), /^text\/plain\b/i, probePath);
  assertMime(effectiveHeaders(hosting, "/manifest.webmanifest"), /^application\/manifest\+json\b/i, "/manifest.webmanifest");
  check(effectiveHeaders(hosting, "/sw.js").get("service-worker-allowed") === "/", "Service worker must retain root scope.");

  const files = await listFiles(output);
  const shipped = files.filter((file) => !(hosting.ignore ?? []).some((pattern) => posix.matchesGlob(file, pattern)));
  for (const file of shipped) check(!/(?:^|\/)(?:\.[^/]+|node_modules|functions|src|scripts|tests)(?:\/|$)|(?:\.map|\.pem|\.key|\.rules)$|^(?:firebase\.json|package(?:-lock)?\.json)$/iu.test(file),
    `Unexpected non-public export file: ${file}.`);
  const clientSources = await Promise.all(shipped.filter((file) => file.startsWith("_next/static/") && file.endsWith(".js"))
    .map((file) => readFile(join(output, file), "utf8")));
  verifyProductionClientBundle(clientSources.join("\n"));
  const html = await readFile(outputFile("/"), "utf8");
  check(/<!doctype html>/i.test(html) && /manifest\.webmanifest/u.test(html), "Exported index.html is missing the document or PWA manifest.");
  const missingPage = await readFile(outputFile("/404.html"), "utf8");
  check(/<!doctype html>/i.test(missingPage), "A static 404 document is required.");
  const probe = await readFile(outputFile(probePath), "utf8");
  check(probe.trim() === "online", "Static connectivity body must be the expected plain-text marker.");
  const manifest = JSON.parse(await readFile(outputFile("/manifest.webmanifest"), "utf8"));
  verifyManifest(manifest);
  const worker = await readFile(outputFile("/sw.js"), "utf8");
  check(worker === await readFile(join(root, "public/sw.js"), "utf8"), "out/sw.js is stale relative to the latest generated worker.");
  check(worker.includes("SKIP_WAITING") && /skipWaiting\s*:\s*(?:!1|false)/u.test(worker), "PWA must retain explicit user-controlled updates.");
  const precached = parsePrecache(worker);
  for (const pathname of precached) {
    check(pathname.startsWith("/_next/static/") || publicFiles.has(pathname), `Unexpected precached response: ${pathname}.`);
    check((await stat(outputFile(pathname))).isFile(), `Precached asset is missing from out: ${pathname}.`);
  }
  for (const pathname of ["/", "/manifest.webmanifest", "/brand/onnuri-food-logo.png", ...manifest.icons.map((icon) => icon.src)])
    check(precached.includes(pathname), `PWA installation asset is not precached: ${pathname}.`);
  check(!precached.some((pathname) => pathname.startsWith("/api/") || pathname.startsWith("/__/")), "Connectivity and private/server responses must never be precached.");

  for (const [pathname, [width, height]] of expectedIcons) {
    const bytes = await readFile(outputFile(pathname));
    check(bytes.length >= 24 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", `${pathname} is not a valid PNG.`);
    check(bytes.readUInt32BE(16) === width && bytes.readUInt32BE(20) === height, `${pathname} has incorrect dimensions.`);
  }
  const favicon = await readFile(outputFile("/favicon.ico"));
  check(favicon.subarray(0, 6).toString("hex") === "000001000100", "Exported favicon.ico is invalid.");
  const initialAssets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/gu)].map((match) => match[1]))];
  check(initialAssets.some((asset) => asset.endsWith(".js")) && initialAssets.some((asset) => asset.endsWith(".css")), "Initial JavaScript/CSS assets were not found in the exported HTML.");
  for (const asset of initialAssets) {
    check((await stat(outputFile(asset))).isFile(), `Initial asset is missing: ${asset}.`);
    check(/max-age=31536000/u.test(effectiveHeaders(hosting, asset).get("cache-control") ?? "")
      && /immutable/u.test(effectiveHeaders(hosting, asset).get("cache-control") ?? ""), "Hashed Next assets must be long-lived and immutable.");
  }
  return { worker, manifest, initialAssets, counts: { exportedFiles: files.length, shippedFiles: shipped.length, precached: precached.length, initialAssets: initialAssets.length } };
}

async function verifyRemote(base, local) {
  const results = [];
  const request = async (pathname, method = "HEAD", expected = 200) => {
    const response = await fetch(new URL(pathname, base), { method, credentials: "omit", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    // Failed/forbidden resource checks deliberately never consume response bodies.
    if (response.status !== expected) { await response.body?.cancel(); throw new Error(`${method} ${pathname.split("?")[0]} returned ${response.status}; expected ${expected}.`); }
    results.push({ path: pathname.split("?")[0], method, status: response.status });
    return response;
  };
  const home = await request("/");
  assertFresh(home.headers, "/"); assertMime(home.headers, /^text\/html\b/i, "/");
  const worker = await request("/sw.js", "GET");
  assertFresh(worker.headers, "/sw.js", true); assertMime(worker.headers, /^(?:application|text)\/javascript\b/i, "/sw.js");
  check(worker.headers.get("service-worker-allowed") === "/", "Remote service-worker scope header is missing.");
  check(sha256(Buffer.from(await worker.arrayBuffer())) === sha256(local.worker), "Remote service worker does not match this build; deployment/DNS may still be old.");
  const manifest = await request("/manifest.webmanifest", "GET");
  assertFresh(manifest.headers, "/manifest.webmanifest"); assertMime(manifest.headers, /^application\/manifest\+json\b/i, "/manifest.webmanifest");
  verifyManifest(await manifest.json());
  for (const method of ["GET", "HEAD"]) {
    const probe = await request(`${probePath}?t=${Date.now()}`, method);
    assertFresh(probe.headers, probePath, true); assertMime(probe.headers, /^text\/plain\b/i, probePath);
    if (method === "GET") check((await probe.text()).trim() === "online", "Connectivity returned HTML or another unexpected response.");
  }
  for (const pathname of expectedIcons.keys()) assertMime((await request(pathname)).headers, /^image\/png\b/i, pathname);
  for (const pathname of local.initialAssets) {
    const asset = await request(pathname);
    assertMime(asset.headers, pathname.endsWith(".css") ? /^text\/css\b/i : /^(?:application|text)\/javascript\b/i, pathname);
    check(/immutable/i.test(asset.headers.get("cache-control") ?? ""), `Remote hashed asset is not immutable: ${pathname}.`);
  }
  for (const pathname of ["/_next/static/onnuriway-verification-missing.js", "/api/onnuriway-verification-missing", "/.env", "/functions/package.json", "/photos/onnuriway-verification-private.webp"])
    await request(pathname, "HEAD", 404);
  return { origin: base.origin, checks: results };
}

function selfTest() {
  const config = { headers: [{ source: "**", headers: [{ key: "Cache-Control", value: "no-cache" }] }, { source: "/api/connectivity{,/**}", headers: [{ key: "cache-control", value: "no-store, max-age=0" }] }] };
  assertFresh(effectiveHeaders(config, "/"), "/");
  assertFresh(effectiveHeaders(config, probePath), probePath, true);
  assertFresh(effectiveHeaders(config, `${probePath}/`), probePath, true);
  assert.throws(() => assertFresh(new Map([["cache-control", "public, max-age=31536000, immutable"]]), "/sw.js", true));
  assert.deepEqual(parsePrecache("precacheEntries:[{'revision':null,'url':'/'},{\"url\":\"/a.js\"}]??[]"), ["/", "/a.js"]);
  assert.throws(() => outputFile("/../secret"));
  assert.throws(() => outputFile("/%2e%2e/secret"));
  assert.throws(() => parseBaseUrl("https://user:password@example.com/"));
  assert.throws(() => parseBaseUrl("http://example.com/"));
  assert.equal(parseBaseUrl("http://127.0.0.1:5000").origin, "http://127.0.0.1:5000");
  const productionConfig = 'projectId:"onnuriway",authDomain:"onnuriway.firebaseapp.com"';
  assert.doesNotThrow(() => verifyProductionClientBundle(productionConfig));
  assert.throws(() => verifyProductionClientBundle('projectId:"demo-inventory-e2e"'));
  assert.throws(() => verifyProductionClientBundle(`${productionConfig};connect("127.0.0.1:9099")`));
  assert.throws(() => verifyProductionClientBundle('projectId:"another-project",authDomain:"onnuriway.firebaseapp.com"'));
  console.log(JSON.stringify({ status: "firebase-hosting-verifier-self-test-passed" }));
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") selfTest();
  else if (args.length === 1 && args[0] === "--help") console.log("Usage: node scripts/verify-firebase-hosting-build.mjs [--url https://onnuriway.com]\n       node scripts/verify-firebase-hosting-build.mjs --self-test\nChecks exported public assets and Hosting configuration. --url additionally verifies public HTTP responses without authentication or writes.");
  else {
    check(args.length === 0 || (args.length === 2 && args[0] === "--url"), "Use no arguments, --self-test, or --url <origin>.");
    const base = args.length ? parseBaseUrl(args[1]) : null;
    const local = await verifyLocal();
    const remote = base ? await verifyRemote(base, local) : null;
    console.log(JSON.stringify({ status: "firebase-hosting-build-passed", ...local.counts, remote,
      remainingBrowserChecks: ["PIN/Google sign-in and App Check", "Kakao map tiles and directions", "private photo viewing/upload against emulators", "installed-PWA update, offline recovery, Back and unsaved forms"] }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ status: "firebase-hosting-verification-failed", message: error instanceof Error ? error.message : "Verification failed." }));
  process.exitCode = 1;
}
