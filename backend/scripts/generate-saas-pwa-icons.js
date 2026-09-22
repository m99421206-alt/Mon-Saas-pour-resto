/**
 * Génère les icônes PWA / favicon du SaaS depuis logo.svg.
 * contain + marge ~10 % pour masques iOS/Android/Google ; fond #FF6C01 (identique au SVG).
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const ROOT = path.join(__dirname, "..", "..");
const LOGO = path.join(ROOT, "assets", "images", "icone", "logo.svg");
/** Aligné sur logo.svg (rect fill="#FF6C01") */
const BRAND_ORANGE = { r: 255, g: 108, b: 1 };
/** Marge de sécurité de chaque côté (évite rognage favicon rond) */
const PADDING_RATIO = 0.1;

const OUTPUTS = [
  { dir: ".", name: "favicon-48x48.png", size: 48 },
  { dir: "frontend", name: "favicon-16x16.png", size: 16 },
  { dir: "frontend", name: "favicon-32x32.png", size: 32 },
  { dir: "frontend", name: "apple-touch-icon.png", size: 180 },
  { dir: "frontend", name: "android-chrome-192x192.png", size: 192 },
  { dir: "frontend", name: "android-chrome-512x512.png", size: 512 },
  { dir: path.join("assets", "images"), name: "apple-touch-icon.png", size: 180 },
  { dir: ".", name: "apple-touch-icon.png", size: 180 },
  { dir: ".", name: "android-chrome-192x192.png", size: 192 },
  { dir: ".", name: "android-chrome-512x512.png", size: 512 },
];

async function renderIcon(size) {
  const innerSize = Math.max(1, Math.round(size * (1 - PADDING_RATIO * 2)));

  const logoBuffer = await sharp(LOGO)
    .resize(innerSize, innerSize, { fit: "contain" })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BRAND_ORANGE,
    },
  })
    .composite([{ input: logoBuffer, gravity: "center" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(LOGO)) {
    console.error(`Logo introuvable : ${LOGO}`);
    process.exit(1);
  }

  for (const output of OUTPUTS) {
    const outDir = path.join(ROOT, output.dir);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, output.name);
    const buffer = await renderIcon(output.size);
    fs.writeFileSync(outPath, buffer);
    console.log(`Icône générée : ${outPath} (${output.size}x${output.size})`);
  }

  const icoSizes = [16, 32, 48];
  const icoPngBuffers = await Promise.all(icoSizes.map((size) => renderIcon(size)));
  const icoBuffer = await toIco(icoPngBuffers);

  for (const icoPath of [
    path.join(ROOT, "favicon.ico"),
    path.join(ROOT, "frontend", "favicon.ico"),
  ]) {
    fs.writeFileSync(icoPath, icoBuffer);
    console.log(`Favicon généré depuis logo.svg : ${icoPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
