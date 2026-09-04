import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const projectRoot = process.cwd();
const iconDirectory = join(projectRoot, "public", "icons");
const brandDirectory = join(projectRoot, "public", "brand");
const sourceLogoPath = join(projectRoot, "assets", "brand", "onnuri-food-logo-original.png");
const browserIconPath = join(projectRoot, "src", "app", "icon.png");

await Promise.all([
  mkdir(iconDirectory, { recursive: true }),
  mkdir(brandDirectory, { recursive: true }),
]);

// The supplied artwork has a transparent outer canvas and a few edge pixels,
// so an explicit, inspected crop preserves the company mark without resampling
// those artifacts into the small app-icon variants.
const COMPANY_LOGO_BOUNDS = { left: 28, top: 135, width: 1718, height: 638 };
const brandMark = await sharp(sourceLogoPath)
  .extract(COMPANY_LOGO_BOUNDS)
  .resize({ width: 1200, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

await writeFile(join(brandDirectory, "onnuri-food-logo.png"), brandMark);

function iconBackground(size) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4faff"/>
          <stop offset="0.54" stop-color="#e8f4ff"/>
          <stop offset="1" stop-color="#edf9f2"/>
        </linearGradient>
        <radialGradient id="blue" cx="0" cy="0" r="1">
          <stop offset="0" stop-color="#22b8f2" stop-opacity=".22"/>
          <stop offset="1" stop-color="#22b8f2" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="green" cx="1" cy="1" r="1">
          <stop offset="0" stop-color="#63d231" stop-opacity=".2"/>
          <stop offset="1" stop-color="#63d231" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#surface)"/>
      <circle cx="0" cy="0" r="${Math.round(size * 0.86)}" fill="url(#blue)"/>
      <circle cx="${size}" cy="${size}" r="${Math.round(size * 0.9)}" fill="url(#green)"/>
    </svg>
  `);
}

// The wave is unusually wide: a padded square inside another padded square made
// Android launchers shrink it twice. Fit the actual artwork, not its empty corners,
// to the maskable 40%-radius safe circle. Keep a small antialiasing margin.
const { data: logoPixels, info: logoInfo } = await sharp(brandMark).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let logoRadius = 0;
for (let y = 0; y < logoInfo.height; y += 1) {
  for (let x = 0; x < logoInfo.width; x += 1) {
    if (logoPixels[(y * logoInfo.width + x) * 4 + 3] === 0) continue;
    logoRadius = Math.max(logoRadius, Math.hypot(x + .5 - logoInfo.width / 2, y + .5 - logoInfo.height / 2));
  }
}
const maskableLogoScale = Math.min(.8, .395 * logoInfo.width / logoRadius);

async function iconBuffer(size, logoScale) {
  const logo = await sharp(brandMark)
    .resize({ width: Math.round(size * logoScale), kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const left = Math.round((size - (metadata.width ?? size)) / 2);
  const top = Math.round((size - (metadata.height ?? size)) / 2);

  return sharp(iconBackground(size))
    .composite([{ input: logo, left, top }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeIcon(filename, size, logoScale) {
  await writeFile(join(iconDirectory, filename), await iconBuffer(size, logoScale));
}

async function writeFavicon() {
  const png = await iconBuffer(32, 0.96);
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);
  icoHeader.writeUInt8(32, 6);
  icoHeader.writeUInt8(32, 7);
  icoHeader.writeUInt16LE(1, 10);
  icoHeader.writeUInt16LE(32, 12);
  icoHeader.writeUInt32LE(png.length, 14);
  icoHeader.writeUInt32LE(icoHeader.length, 18);
  await writeFile(join(projectRoot, "public", "favicon.ico"), Buffer.concat([icoHeader, png]));
}

await Promise.all([
  writeIcon("onnuriway-company-icon-192-v4.png", 192, 0.96),
  writeIcon("onnuriway-company-icon-512-v4.png", 512, 0.96),
  writeIcon("onnuriway-company-icon-maskable-512-v4.png", 512, maskableLogoScale),
  writeIcon("onnuriway-company-apple-touch-icon-v4.png", 180, 0.96),
  iconBuffer(64, 0.96).then((buffer) => writeFile(browserIconPath, buffer)),
  writeFavicon(),
]);

console.log(`Generated company PWA icon v4 set (standard 96%, maskable ${(maskableLogoScale * 100).toFixed(1)}%).`);
