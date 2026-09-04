import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const serviceWorkerPath = join(projectRoot, "public", "sw.js");
const serviceWorker = await readFile(serviceWorkerPath, "utf8");

for (const required of [
  "phase20",
  "app-shell-",
  "public-assets-",
  "school-thumbnails-",
  "manifest.webmanifest",
  "onnuriway-company-icon-192-v3.png",
  "onnuriway-company-icon-maskable-512-v3.png",
  "onnuri-food-logo.png",
  "SKIP_WAITING",
]) {
  if (!serviceWorker.includes(required)) {
    throw new Error(`Generated service worker is missing ${required}.`);
  }
}

for (const forbidden of [
  "firebase",
  "googleapis",
  "employeeLogin",
  "exportCsv",
]) {
  if (serviceWorker.toLowerCase().includes(forbidden.toLowerCase())) {
    throw new Error(`Generated service worker unexpectedly contains ${forbidden}.`);
  }
}

if (serviceWorker.includes("'url':'/api/connectivity'")) {
  throw new Error("Generated service worker must not precache the connectivity response.");
}

const expectedIcons = new Map([
  ["public/icons/onnuriway-company-icon-192-v3.png", [192, 192]],
  ["public/icons/onnuriway-company-icon-512-v3.png", [512, 512]],
  ["public/icons/onnuriway-company-icon-maskable-512-v3.png", [512, 512]],
  ["public/icons/onnuriway-company-apple-touch-icon-v3.png", [180, 180]],
  ["public/brand/onnuri-food-logo.png", [1200, 446]],
  ["src/app/icon.png", [64, 64]],
]);

const favicon = await readFile(join(projectRoot, "public", "favicon.ico"));
if (favicon.subarray(0, 6).toString("hex") !== "000001000100") {
  throw new Error("favicon.ico has an invalid ICO header.");
}

for (const [filename, [expectedWidth, expectedHeight]] of expectedIcons) {
  const iconPath = join(projectRoot, ...filename.split("/"));
  const bytes = await readFile(iconPath);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${filename} is not a PNG.`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${filename} has ${width}x${height}; expected ${expectedWidth}x${expectedHeight}.`);
  }
}

console.log(JSON.stringify({
  status: "phase14-pwa-build-passed",
  serviceWorkerBytes: (await stat(serviceWorkerPath)).size,
  faviconBytes: favicon.length,
  icons: Object.fromEntries(expectedIcons),
}, null, 2));
