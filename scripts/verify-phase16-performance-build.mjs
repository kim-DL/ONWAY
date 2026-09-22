import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextRoot = join(projectRoot, ".next");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readPageReferenceManifest() {
  const source = readFileSync(join(nextRoot, "server/app/page_client-reference-manifest.js"), "utf8");
  const assignment = source.indexOf("={");
  if (assignment < 0) throw new Error("Unable to parse the page client reference manifest.");
  return JSON.parse(source.slice(assignment + 1).replace(/;\s*$/u, ""));
}

function sizeAsset(asset) {
  const bytes = readFileSync(join(nextRoot, asset));
  return { asset, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
}

function readInitialHtmlAssets(extension = "js") {
  const source = readFileSync(join(nextRoot, "server/app/index.html"), "utf8");
  const tags = source.match(/<(?:script|link)\b[^>]*>/gu) ?? [];
  const assets = [];

  for (const tag of tags) {
    if (/\bnomodule\b/iu.test(tag)) continue;
    const reference = tag.match(/(?:src|href)="\/_next\/(static\/[^"]+\.(?:js|css))"/iu)?.[1];
    if (reference?.endsWith(`.${extension}`)) assets.push(reference);
  }

  return assets;
}

function assertBudget(condition, message) {
  if (!condition) throw new Error(`Phase 16 performance gate failed: ${message}`);
}

const buildManifest = readJson(join(nextRoot, "build-manifest.json"));
const pageManifest = readPageReferenceManifest();
const loadableManifest = readJson(join(nextRoot, "react-loadable-manifest.json"));

const initialAssets = new Set(buildManifest.rootMainFiles);
for (const asset of readInitialHtmlAssets()) initialAssets.add(asset);
for (const clientModule of Object.values(pageManifest.clientModules)) {
  for (const chunk of clientModule.chunks) {
    if (typeof chunk === "string" && chunk.startsWith("static/")) initialAssets.add(chunk);
  }
}
const initial = [...initialAssets].map(sizeAsset);
const initialRawBytes = initial.reduce((sum, asset) => sum + asset.rawBytes, 0);
const initialGzipBytes = initial.reduce((sum, asset) => sum + asset.gzipBytes, 0);

const dynamicEntries = Object.entries(loadableManifest)
  .filter(([key]) => /features[\\/]/u.test(key))
  .map(([boundary, value]) => ({ boundary, files: value.files }));
const dynamicAssets = [...new Set(dynamicEntries.flatMap((entry) => entry.files))].map(sizeAsset);
const stylesheets = readdirSync(join(nextRoot, "static/css"))
  .filter((file) => file.endsWith(".css"))
  .map((file) => sizeAsset(`static/css/${file}`));
const stylesheetRawBytes = stylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const stylesheetGzipBytes = stylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const customerBoundaries = ["customer-workspace", "customer-admin", "customer-editor", "customer-map", "customer-photo-viewer"];
const customerEntries = dynamicEntries.filter((entry) => customerBoundaries.some((name) => entry.boundary.endsWith(`/${name}`)));
const customerAssetNames = new Set(customerEntries.flatMap((entry) => entry.files));
// Next groups the photo transition, school viewer and scoped school gallery.
// Phase 43 migrates the old global gallery here (6,711B raw / 1,928B gzip).
// Phase 48 reuses this unchanged shared asset in the inventory photo viewer.
// Permit exactly these three deferred owners, without charging the shared CSS
// twice or increasing the existing school/shared envelope.
const photoViewerNames = ["customer-photo-viewer", "school-photo-gallery", "inventory-photo-viewer"];
const photoViewerEntries = dynamicEntries.filter((entry) => photoViewerNames.some((name) => entry.boundary.endsWith(`/${name}`)));
const photoMorphStylesheets = stylesheets.filter((asset) =>
  readFileSync(join(nextRoot, asset.asset), "utf8").includes("--photo-morph-ui"));
const photoMorphAssets = new Set(photoMorphStylesheets.map((asset) => asset.asset));
const photoMorphRawBytes = photoMorphStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const photoMorphGzipBytes = photoMorphStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const customerStylesheets = stylesheets.filter((asset) => customerAssetNames.has(asset.asset) && !photoMorphAssets.has(asset.asset));
// Delivery-photo Phase 1 is a hidden, independently loaded customer-mode
// workspace. Keep its CSS and JavaScript out of the initial and legacy budgets,
// while retaining the existing customer catalog chunk as an approved shared
// dependency. Existing feature ceilings below remain unchanged.
const deliveryPhotoEntries = dynamicEntries.filter((entry) => entry.boundary.endsWith("/delivery-photo-workspace"));
const deliveryPhotoAssetNames = new Set(deliveryPhotoEntries.flatMap((entry) => entry.files));
const deliveryPhotoExclusiveAssetNames = new Set([...deliveryPhotoAssetNames].filter((asset) => !customerAssetNames.has(asset)));
const deliveryPhotoStylesheets = stylesheets.filter((asset) => deliveryPhotoAssetNames.has(asset.asset));
const deliveryPhotoStylesheetRawBytes = deliveryPhotoStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const deliveryPhotoStylesheetGzipBytes = deliveryPhotoStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const deliveryPhotoJavascriptGzipBytes = [...deliveryPhotoAssetNames].filter((asset) => asset.endsWith(".js"))
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
// Phase 40 moves the entire retired global admin layer into a scoped, lazy UI.
// Measure the dock, forms and dialogs together: webpack combines their modules.
// Employee/login boundaries must never acquire these styles.
const adminWorkspaceEntry = dynamicEntries.find((entry) => entry.boundary.endsWith("/admin-workspace"));
const adminInterfaceStylesheets = stylesheets.filter((asset) =>
  adminWorkspaceEntry?.files.includes(asset.asset)
  && readFileSync(join(nextRoot, asset.asset), "utf8").includes("--admin-workspace-ui"));
const adminInterfaceAssets = new Set(adminInterfaceStylesheets.map((asset) => asset.asset));
const adminInterfaceRawBytes = adminInterfaceStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const adminInterfaceGzipBytes = adminInterfaceStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
// Phase 45: inventory has a separate lazy boundary shared by staff and admin.
// Account for its new UI separately, never by relaxing existing app budgets.
const inventoryWorkspaceEntries = dynamicEntries.filter((entry) => entry.boundary.endsWith("/inventory-workspace"));
const inventoryPhotoEntries = dynamicEntries.filter((entry) => entry.boundary.endsWith("/inventory-photo-viewer"));
const inventoryManufacturerEntries = dynamicEntries.filter((entry) => entry.boundary.endsWith("/inventory-manufacturer-picker"));
const inventoryManufacturerFieldEntries = dynamicEntries.filter((entry) => entry.boundary.endsWith("/inventory-manufacturer-field"));
const inventoryEntries = [...inventoryWorkspaceEntries, ...inventoryPhotoEntries];
const inventoryWorkspaceAssetNames = new Set(inventoryWorkspaceEntries.flatMap((entry) => entry.files));
const inventoryAssetNames = new Set(inventoryEntries.flatMap((entry) => entry.files));
const inventoryManufacturerAssetNames = new Set(inventoryManufacturerEntries.flatMap((entry) => entry.files));
const inventoryManufacturerFieldAssetNames = new Set(inventoryManufacturerFieldEntries.flatMap((entry) => entry.files));
// The workspace owns its form/detail styles; the lazy viewer can reuse those
// already-loaded styles. Its shared morph/gallery CSS is a separate existing
// envelope. Use file sets rather than sums of per-boundary lists (staff/admin
// and multiple viewers refer to the same physical files).
const inventoryStylesheets = stylesheets.filter((asset) => inventoryAssetNames.has(asset.asset) && !photoMorphAssets.has(asset.asset));
const inventoryManufacturerStylesheets = stylesheets.filter((asset) => inventoryManufacturerAssetNames.has(asset.asset));
const inventoryStylesheetRawBytes = inventoryStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const inventoryStylesheetGzipBytes = inventoryStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const inventoryJavascriptGzipBytes = [...inventoryAssetNames].filter((asset) => asset.endsWith(".js"))
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
const inventoryWorkspaceJavascriptGzipBytes = [...inventoryWorkspaceAssetNames].filter((asset) => asset.endsWith(".js"))
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
const inventoryViewerAdditionalAssets = [...inventoryAssetNames].filter((asset) => !inventoryWorkspaceAssetNames.has(asset)).map(sizeAsset);
const inventoryViewerJavascriptGzipBytes = inventoryViewerAdditionalAssets.filter((asset) => asset.asset.endsWith(".js"))
  .reduce((sum, asset) => sum + asset.gzipBytes, 0);
const inventorySharedPhotoStylesheets = photoMorphStylesheets.filter((asset) => inventoryAssetNames.has(asset.asset));
const inventorySharedPhotoStylesheetRawBytes = inventorySharedPhotoStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const inventorySharedPhotoStylesheetGzipBytes = inventorySharedPhotoStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const inventoryWithPhotoStylesheetRawBytes = inventoryStylesheetRawBytes + inventorySharedPhotoStylesheetRawBytes;
const inventoryWithPhotoStylesheetGzipBytes = inventoryStylesheetGzipBytes + inventorySharedPhotoStylesheetGzipBytes;
const inventoryManufacturerJavascriptGzipBytes = [...inventoryManufacturerAssetNames].filter((asset) => asset.endsWith(".js"))
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
const inventoryManufacturerFieldJavascriptGzipBytes = [...inventoryManufacturerFieldAssetNames].filter((asset) => asset.endsWith(".js"))
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
const inventoryManufacturerStylesheetRawBytes = inventoryManufacturerStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const inventoryManufacturerStylesheetGzipBytes = inventoryManufacturerStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const legacyStylesheets = stylesheets.filter((asset) => !customerAssetNames.has(asset.asset) && !deliveryPhotoAssetNames.has(asset.asset) && !adminInterfaceAssets.has(asset.asset) && !photoMorphAssets.has(asset.asset) && !inventoryAssetNames.has(asset.asset) && !inventoryManufacturerAssetNames.has(asset.asset));
const legacyStylesheetRawBytes = legacyStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const legacyStylesheetGzipBytes = legacyStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const customerStylesheetRawBytes = customerStylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const customerStylesheetGzipBytes = customerStylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const customerJavascriptGzipBytes = [...customerAssetNames].filter((asset) => asset.endsWith(".js"))
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
const initialStylesheets = new Set(readInitialHtmlAssets("css"));
const legacyDynamicAssets = new Set(dynamicEntries.filter((entry) => !customerEntries.includes(entry)).flatMap((entry) => entry.files));
assertBudget(inventoryWorkspaceEntries.length === 2 && inventoryPhotoEntries.length === 1,
  "inventory must retain two staff/admin workspace entries and one deferred photo viewer");
assertBudget(inventoryManufacturerEntries.length === 1, "inventory manufacturer picker must retain one deferred boundary");
assertBudget(inventoryManufacturerFieldEntries.length === 1, "inventory manufacturer trigger must retain one deferred boundary");
assertBudget(deliveryPhotoEntries.length === 1, "delivery photo workspace must retain one deferred boundary");
assertBudget(deliveryPhotoStylesheets.length === 1, "delivery photo workspace must retain one isolated stylesheet");
for (const asset of deliveryPhotoAssetNames) {
  assertBudget(!initialAssets.has(asset) && !initialStylesheets.has(asset), `delivery photo asset ${asset} must stay deferred`);
}
for (const asset of deliveryPhotoExclusiveAssetNames) {
  assertBudget(dynamicEntries.filter((entry) => entry.files.includes(asset)).every((entry) => deliveryPhotoEntries.includes(entry)),
    `delivery photo asset ${asset} must not load with unrelated work modes`);
}
for (const asset of inventoryManufacturerFieldAssetNames) {
  assertBudget(!initialAssets.has(asset) && !initialStylesheets.has(asset), `manufacturer trigger asset ${asset} must stay deferred`);
}
for (const asset of inventoryManufacturerAssetNames) {
  assertBudget(!initialAssets.has(asset) && !initialStylesheets.has(asset), `manufacturer picker asset ${asset} must stay deferred`);
  assertBudget(dynamicEntries.filter((entry) => entry.files.includes(asset)).every((entry) => inventoryManufacturerEntries.includes(entry)),
    `manufacturer picker asset ${asset} must not merge into the inventory base or unrelated modes`);
}
for (const asset of inventoryStylesheets) {
  assertBudget(!initialStylesheets.has(asset.asset), "inventory CSS must not load on the login page");
  assertBudget(dynamicEntries.filter((entry) => entry.files.includes(asset.asset)).every((entry) => inventoryEntries.includes(entry)),
    "inventory CSS must not load with unrelated work modes");
}
for (const asset of inventoryAssetNames) {
  if (photoMorphAssets.has(asset)) continue;
  assertBudget(!initialAssets.has(asset) && !initialStylesheets.has(asset), `inventory asset ${asset} must not load on the login page`);
  assertBudget(dynamicEntries.filter((entry) => entry.files.includes(asset)).every((entry) => inventoryEntries.includes(entry)),
    `inventory asset ${asset} must not leak into unrelated work modes`);
}
for (const asset of stylesheets.filter((item) => !inventoryStylesheets.includes(item) && !inventoryManufacturerStylesheets.includes(item))) {
  assertBudget(!/\.inventory(?:-[\w-]+)?_[\w-]+__/u.test(readFileSync(join(nextRoot, asset.asset), "utf8")),
    `inventory scoped CSS must not be merged into unrelated/shared asset ${asset.asset}`);
}
assertBudget(photoViewerEntries.length === 3 && photoViewerNames.every((name) => photoViewerEntries.filter((entry) => entry.boundary.endsWith(`/${name}`)).length === 1),
  "photo UI must have exactly one customer, school and inventory viewer boundary");
assertBudget(photoMorphStylesheets.length === 1, "photo transition must retain one small shared CSS module");
for (const asset of photoMorphStylesheets) {
  assertBudget(!initialStylesheets.has(asset.asset), "photo transition CSS must not load on the login page");
  const owners = dynamicEntries.filter((entry) => entry.files.includes(asset.asset));
  assertBudget(owners.length === 3 && photoViewerEntries.every((entry) => owners.includes(entry)),
    "photo transition CSS must load only with the three approved photo viewers");
}
const stylesheetPartitions = [...legacyStylesheets, ...customerStylesheets, ...deliveryPhotoStylesheets, ...adminInterfaceStylesheets, ...photoMorphStylesheets, ...inventoryStylesheets, ...inventoryManufacturerStylesheets];
assertBudget(stylesheetPartitions.length === stylesheets.length && new Set(stylesheetPartitions.map((asset) => asset.asset)).size === stylesheets.length,
  "every stylesheet must be accounted for exactly once across feature and shared budgets");
assertBudget(adminInterfaceStylesheets.length === 1, "admin interface must retain its isolated CSS module");
for (const asset of adminInterfaceStylesheets) {
  assertBudget(!initialStylesheets.has(asset.asset), "admin interface CSS must not load on the login page");
  assertBudget(!dynamicEntries.some((entry) => entry !== adminWorkspaceEntry && entry.files.includes(asset.asset)),
    "admin interface CSS must not load with unrelated employee features");
}
for (const name of customerBoundaries) {
  assertBudget(customerEntries.some((entry) => entry.boundary.endsWith(`/${name}`)), `missing isolated dynamic customer boundary: ${name}`);
}
assertBudget(customerStylesheets.length >= 2, "customer UI and map styles must remain separately deferred");
for (const asset of customerStylesheets) {
  assertBudget(!initialStylesheets.has(asset.asset), `customer CSS ${asset.asset} must not load with initial HTML`);
  assertBudget(!legacyDynamicAssets.has(asset.asset), `customer CSS ${asset.asset} must not be charged to unrelated features`);
}
const salesWorkspaceEntry = dynamicEntries.find((entry) =>
  /app-shell[\\/]app-shell\.tsx -> .*sales-workspace$/u.test(entry.boundary));
if (!salesWorkspaceEntry) throw new Error("Missing sales workspace entry for bundle measurement.");
const salesWorkspaceGzipBytes = salesWorkspaceEntry.files
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
const largestJavascriptGzipBytes = Math.max(
  ...initial.map((asset) => asset.gzipBytes),
  ...dynamicAssets.filter((asset) => asset.asset.endsWith(".js")).map((asset) => asset.gzipBytes),
);

const requiredBoundaries = [
  "auth-application",
  "app-shell",
  "school-search",
  "school-detail",
  "school-photo-gallery",
  "sales-workspace",
  "sales-history-timeline",
  "sales-route-planner",
  "sales-claim-picker",
];
for (const boundary of requiredBoundaries) {
  assertBudget(
    dynamicEntries.some((entry) => entry.boundary.includes(boundary)),
    `missing dynamic boundary: ${boundary}`,
  );
}
const serviceWorker = readFileSync(join(projectRoot, "public/sw.js"), "utf8");
for (const tool of ["sales-route-planner", "sales-claim-picker", "admin-workspace", ...customerBoundaries, "delivery-photo-workspace", "inventory-workspace", "inventory-photo-viewer"]) {
  const entry = dynamicEntries.find(({ boundary }) => boundary.endsWith(tool));
  assertBudget(entry?.files.every((asset) => serviceWorker.includes(asset)),
    `deferred ${tool} assets must remain in the PWA precache`);
}

assertBudget(initialRawBytes <= 520 * 1024, `initial JavaScript raw ${initialRawBytes}B exceeds 520KiB`);
assertBudget(initialGzipBytes <= 160 * 1024, `initial JavaScript gzip ${initialGzipBytes}B exceeds 160KiB`);
assertBudget(largestJavascriptGzipBytes <= 90 * 1024, `largest JavaScript chunk gzip ${largestJavascriptGzipBytes}B exceeds 90KiB`);
// Keep retired design layers out of the shipped payload (phase 31 baseline:
// 297,293B raw / 55,570B gzip before cleanup). Existing CSS retains exactly its
// phase-31 limits; the new, exclusively deferred customer feature has its own
// measured envelope. Phase 34 replaces the detail view and adds employee editing
// with explicit pin/address confirmation: measured 29,617B raw / 6,588B gzip CSS
// and 21,478B gzip JS before final contact-disclosure polish. Retired home/detail
// CSS was removed. Initial and legacy limits remain unchanged; only this deferred
// feature receives a bounded allowance for the added UI and safety behavior.
// Phase 35 adds private photo preview/picker + safe upload lifecycle and the
// compact card treatment. Measured 35,759B raw / 7,860B gzip customer CSS and
// 26,889B gzip deferred customer JS. The added allowance stays in this isolated
// feature; initial, school/sales and shared stylesheet budgets are unchanged.
// Phase 37 adds the district/dong directory, separately loaded private photo
// viewer, camera/album controls and region lookup/retry behavior. Measured
// 47,069B raw / 9,483B gzip CSS and 32,001B gzip JS across these customer-only
// boundaries. Keep initial/legacy budgets unchanged and a narrow feature margin.
// Phase 38 shares one photo preparation between preview/save, protects native
// album reads and compacts the search header. Measured 48,640B raw / 9,727B gzip
// CSS and 33,090B gzip JS after AVIF brand validation, without a new dependency.
// Only the deferred
// customer envelope grows; initial and existing school/sales limits stay fixed.
assertBudget(legacyStylesheetRawBytes <= 235 * 1024, `legacy CSS raw ${legacyStylesheetRawBytes}B exceeds 235KiB`);
assertBudget(legacyStylesheetGzipBytes <= 44.5 * 1024, `legacy CSS gzip ${legacyStylesheetGzipBytes}B exceeds 44.5KiB`);
assertBudget(adminInterfaceRawBytes <= 64 * 1024, `admin interface CSS raw ${adminInterfaceRawBytes}B exceeds 64KiB`);
assertBudget(adminInterfaceGzipBytes <= 10 * 1024, `admin interface CSS gzip ${adminInterfaceGzipBytes}B exceeds 10KiB`);
assertBudget(photoMorphRawBytes <= 6.75 * 1024, `deferred photo UI CSS raw ${photoMorphRawBytes}B exceeds 6.75KiB`);
assertBudget(photoMorphGzipBytes <= 1.9375 * 1024, `deferred photo UI CSS gzip ${photoMorphGzipBytes}B exceeds 1.9375KiB`);
assertBudget(legacyStylesheetRawBytes + photoMorphRawBytes <= (235 + 3.5) * 1024, "combined school/shared CSS raw must retain the pre-redesign envelope");
// Phase 46 adds the accessible four-mode picker beside the brand. After
// removing superseded mode-control rules and shortening scoped selectors,
// allocate only 512B for its net shared CSS growth. Individual legacy/photo,
// initial JS and unrelated feature limits remain unchanged.
assertBudget(legacyStylesheetGzipBytes + photoMorphGzipBytes <= (44.5 + 1.625) * 1024, "combined school/shared CSS gzip exceeds the mode-picker envelope");
assertBudget(customerStylesheetRawBytes <= 48 * 1024, `customer CSS raw ${customerStylesheetRawBytes}B exceeds 48KiB`);
assertBudget(customerStylesheetGzipBytes <= 9.75 * 1024, `customer CSS gzip ${customerStylesheetGzipBytes}B exceeds 9.75KiB`);
// Phase 41 adds cancellable WAAPI geometry and photo/dialog lifecycle handling.
// Measured 34,663B gzip; retain a narrow margin without raising initial JS limits.
// Phase 47: abortable album reads, incomplete-read fallback and a guarded
// document-picker recovery add shared photo reliability code. Measured 35,876B
// gzip in deferred customer boundaries. Allocate 1KiB, with no new dependency
// and no change to initial JS, school/sales, CSS or inventory budgets.
// P2-B adds the memory-only revalidation coordinator and freshness state to the
// existing customer boundary. Measured 36,705B gzip; add only 512B while the
// initial, inventory, school/sales and stylesheet budgets remain unchanged.
assertBudget(customerJavascriptGzipBytes <= 36 * 1024, `deferred customer JavaScript gzip ${customerJavascriptGzipBytes}B exceeds 36KiB`);
assertBudget(deliveryPhotoStylesheetRawBytes <= 6 * 1024, `delivery photo CSS raw ${deliveryPhotoStylesheetRawBytes}B exceeds 6KiB`);
assertBudget(deliveryPhotoStylesheetGzipBytes <= 2 * 1024, `delivery photo CSS gzip ${deliveryPhotoStylesheetGzipBytes}B exceeds 2KiB`);
assertBudget(deliveryPhotoJavascriptGzipBytes <= 10 * 1024, `delivery photo JavaScript gzip ${deliveryPhotoJavascriptGzipBytes}B exceeds 10KiB`);
assertBudget(salesWorkspaceGzipBytes <= 14 * 1024, `sales workspace gzip ${salesWorkspaceGzipBytes}B exceeds 14KiB`);
// Phase 49: personal accessible count toggle, guarded More actions, read-only
// lot confirmations and two-state expiry entry. Retired and overwritten CSS
// was removed first. Measured inventory-only CSS 28,656B raw / 6,480B gzip;
// allocate a narrow 28.5KiB / 6.5KiB feature envelope. The shared photo CSS
// remains 6,711/1,928B and JS stays within its unchanged 24KiB budget. Initial,
// school/sales/customer/admin assets and all isolation checks remain unchanged.
// P2-B's coordinator and freshness state measure 25,028B gzip. Give this lazy
// boundary a 1KiB allowance without changing any initial or unrelated budget.
assertBudget(inventoryStylesheetRawBytes <= 28.5 * 1024, `inventory CSS raw ${inventoryStylesheetRawBytes}B exceeds 28.5KiB`);
assertBudget(inventoryStylesheetGzipBytes <= 6.5 * 1024, `inventory CSS gzip ${inventoryStylesheetGzipBytes}B exceeds 6.5KiB`);
assertBudget(inventoryJavascriptGzipBytes <= 25 * 1024, `inventory JavaScript gzip ${inventoryJavascriptGzipBytes}B exceeds 25KiB`);
assertBudget(inventoryViewerJavascriptGzipBytes <= 2.25 * 1024, `inventory photo viewer JavaScript gzip ${inventoryViewerJavascriptGzipBytes}B exceeds 2.25KiB`);

const report = {
  generatedAt: new Date().toISOString(),
  budgets: {
    initialRawBytes: 520 * 1024,
    initialGzipBytes: 160 * 1024,
    largestJavascriptGzipBytes: 90 * 1024,
    legacyStylesheetRawBytes: 235 * 1024,
    legacyStylesheetGzipBytes: 44.5 * 1024,
    adminInterfaceRawBytes: 64 * 1024,
    adminInterfaceGzipBytes: 10 * 1024,
    photoMorphRawBytes: 6.75 * 1024,
    photoMorphGzipBytes: 1.9375 * 1024,
    combinedSchoolStylesheetRawBytes: (235 + 3.5) * 1024,
    combinedSchoolStylesheetGzipBytes: (44.5 + 1.625) * 1024,
    customerStylesheetRawBytes: 48 * 1024,
    customerStylesheetGzipBytes: 9.75 * 1024,
    customerJavascriptGzipBytes: 36 * 1024,
    deliveryPhotoStylesheetRawBytes: 6 * 1024,
    deliveryPhotoStylesheetGzipBytes: 2 * 1024,
    deliveryPhotoJavascriptGzipBytes: 10 * 1024,
    salesWorkspaceGzipBytes: 14 * 1024,
    inventoryStylesheetRawBytes: 28.5 * 1024,
    inventoryStylesheetGzipBytes: 6.5 * 1024,
    inventoryJavascriptGzipBytes: 25 * 1024,
    inventoryViewerJavascriptGzipBytes: 2.25 * 1024,
  },
  measurements: {
    initialAssetCount: initial.length,
    initialRawBytes,
    initialGzipBytes,
    largestJavascriptGzipBytes,
    dynamicBoundaryCount: dynamicEntries.length,
    dynamicAssetCount: dynamicAssets.length,
    stylesheetRawBytes,
    stylesheetGzipBytes,
    legacyStylesheetRawBytes,
    legacyStylesheetGzipBytes,
    adminInterfaceRawBytes,
    adminInterfaceGzipBytes,
    photoMorphRawBytes,
    photoMorphGzipBytes,
    customerStylesheetRawBytes,
    customerStylesheetGzipBytes,
    customerJavascriptGzipBytes,
    deliveryPhotoStylesheetRawBytes,
    deliveryPhotoStylesheetGzipBytes,
    deliveryPhotoJavascriptGzipBytes,
    salesWorkspaceGzipBytes,
    inventoryStylesheetRawBytes,
    inventoryStylesheetGzipBytes,
    inventoryJavascriptGzipBytes,
    inventoryWorkspaceJavascriptGzipBytes,
    inventoryViewerJavascriptGzipBytes,
    inventoryManufacturerJavascriptGzipBytes,
    inventoryManufacturerFieldJavascriptGzipBytes,
    inventoryManufacturerStylesheetRawBytes,
    inventoryManufacturerStylesheetGzipBytes,
    inventorySharedPhotoStylesheetRawBytes,
    inventorySharedPhotoStylesheetGzipBytes,
    inventoryWithPhotoStylesheetRawBytes,
    inventoryWithPhotoStylesheetGzipBytes,
  },
  inventoryAssetAccounting: {
    workspaceAssets: [...inventoryWorkspaceAssetNames],
    viewerAdditionalAssets: inventoryViewerAdditionalAssets,
    exclusiveStylesheets: inventoryStylesheets,
    sharedPhotoStylesheets: inventorySharedPhotoStylesheets,
    manufacturerPickerAssets: [...inventoryManufacturerAssetNames].map(sizeAsset),
    manufacturerFieldAssets: [...inventoryManufacturerFieldAssetNames].map(sizeAsset),
    note: "Shared photo styles count once in global totals; inventoryWithPhoto measurements describe the complete visited flow, not an additional budget charge.",
  },
  initial,
  dynamicEntries,
  stylesheets,
  status: "passed",
};

writeFileSync(
  join(nextRoot, "diagnostics/phase16-performance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(report.measurements, null, 2));
console.log("Phase 16 production bundle performance gate passed.");
