// Regenerates the PNG and ICO brand files from the SVG sources in public/brand.
// Run with: node scripts/generate-brand-assets.mjs
// The wordmark uses the Manrope font, so the full logo is rendered in a browser
// (Playwright's Chromium) where the font is available; icons need no font.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const dir = fileURLToPath(new URL("../public/brand/", import.meta.url));
const iconSvg = await readFile(`${dir}caremate-icon.svg`);

/** The mark on a white rounded tile, so it reads on any background, including dark. */
async function tile(size, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(iconSvg).resize(inner, inner).png().toBuffer();
  const radius = Math.round(size * 0.22);
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#ffffff"/></svg>`,
  );
  const offset = Math.round((size - inner) / 2);
  return sharp(background).composite([{ input: mark, left: offset, top: offset }]).png().toBuffer();
}

// Square, full-bleed white with the mark inside the safe zone, for maskable PWA icons.
async function maskable(size) {
  const inner = Math.round(size * 0.72);
  const mark = await sharp(iconSvg).resize(inner, inner).png().toBuffer();
  const offset = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer();
}

/** An ICO file holding PNG images, which every current browser accepts. */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

await writeFile(`${dir}app-icon-192.png`, await tile(192, 0.08));
await writeFile(`${dir}app-icon-512.png`, await tile(512, 0.08));
await writeFile(`${dir}app-icon-maskable-512.png`, await maskable(512));
await writeFile(`${dir}apple-touch-icon.png`, await maskable(180));
const favicons = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await tile(size, 0.02) })));
await writeFile(`${dir}favicon.ico`, ico(favicons));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 660 }, deviceScaleFactor: 2 });
// One version for light backgrounds and one for dark ones.
for (const [logoFile, iconFile, output] of [
  ["caremate-logo.svg", "caremate-icon.svg", "caremate-logo.png"],
  ["caremate-logo-on-dark.svg", "caremate-icon-on-dark.svg", "caremate-logo-on-dark.png"],
]) {
  const icon = await readFile(`${dir}${iconFile}`);
  const logo = (await readFile(`${dir}${logoFile}`, "utf8")).replace(
    `href="${iconFile}"`,
    `href="data:image/svg+xml;base64,${icon.toString("base64")}"`,
  );
  await page.setContent(
    `<html><head><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@800&display=block" rel="stylesheet"></head>
     <body style="margin:0;background:transparent">${logo}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => document.fonts.check("800 108px Manrope"));
  if (!font) throw new Error("Manrope did not load; the wordmark would use a fallback font.");
  await page.locator("svg").screenshot({ path: `${dir}${output}`, omitBackground: true });
}
await browser.close();
console.log("Brand assets written to public/brand.");
