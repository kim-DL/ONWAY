import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const projectRoot = process.cwd();
const outputDirectory = join(projectRoot, "public", "icons");
await mkdir(outputDirectory, { recursive: true });

function iconSvg(size, safeInset = 0) {
  const inset = Math.round(size * safeInset);
  const contentSize = size - inset * 2;
  const radius = Math.round(contentSize * 0.28);
  const x = inset;
  const y = inset;
  const barX = Math.round(inset + contentSize * 0.24);
  const barWidth = Math.round(contentSize * 0.52);
  const barHeight = Math.max(3, Math.round(contentSize * 0.1));
  const firstY = Math.round(inset + contentSize * 0.29);
  const secondY = Math.round(inset + contentSize * 0.47);
  const thirdY = Math.round(inset + contentSize * 0.65);
  const shortWidth = Math.round(contentSize * 0.32);
  const dotRadius = Math.round(contentSize * 0.09);
  const dotX = Math.round(inset + contentSize * 0.68);
  const dotY = Math.round(inset + contentSize * 0.52);

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="#153f35"/>
      <rect x="${x}" y="${y}" width="${contentSize}" height="${contentSize}" rx="${radius}" fill="#153f35"/>
      <rect x="${barX}" y="${firstY}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="#d8e563"/>
      <rect x="${barX}" y="${secondY}" width="${shortWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="#d8e563"/>
      <rect x="${barX}" y="${thirdY}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="#d8e563"/>
      <circle cx="${dotX}" cy="${dotY}" r="${dotRadius}" fill="#e97132"/>
    </svg>
  `);
}

async function writeIcon(filename, size, safeInset = 0) {
  await sharp(iconSvg(size, safeInset)).png({ compressionLevel: 9 }).toFile(join(outputDirectory, filename));
}

async function writeFavicon() {
  const png = await sharp(iconSvg(32)).png({ compressionLevel: 9 }).toBuffer();
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
  writeIcon("icon-192.png", 192, 0),
  writeIcon("icon-512.png", 512, 0),
  writeIcon("icon-maskable-512.png", 512, 0.1),
  writeIcon("apple-touch-icon.png", 180, 0.04),
  writeFavicon(),
]);

console.log("Generated Phase 14 PWA icons in public/icons.");
