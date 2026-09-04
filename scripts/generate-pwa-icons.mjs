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
  const inset = Math.max(2, Math.round(size * 0.018));
  const radius = Math.round(size * 0.22);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="0.54" stop-color="#f5faff"/>
          <stop offset="1" stop-color="#eff9f0"/>
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
      <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" rx="${radius}" fill="none" stroke="#ffffff" stroke-opacity=".72" stroke-width="${Math.max(1, Math.round(size * 0.009))}"/>
    </svg>
  `);
}

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
  const png = await iconBuffer(32, 0.9);
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
  writeIcon("onnuriway-company-icon-192-v3.png", 192, 0.84),
  writeIcon("onnuriway-company-icon-512-v3.png", 512, 0.84),
  writeIcon("onnuriway-company-icon-maskable-512-v3.png", 512, 0.66),
  writeIcon("onnuriway-company-apple-touch-icon-v3.png", 180, 0.8),
  iconBuffer(64, 0.86).then((buffer) => writeFile(browserIconPath, buffer)),
  writeFavicon(),
]);

console.log("Generated Onnuri General Foods brand assets and PWA icon v3 set.");
