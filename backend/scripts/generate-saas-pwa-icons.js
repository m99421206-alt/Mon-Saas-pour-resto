/**
 * Génère les icônes PWA / écran d'accueil du SaaS depuis logo.svg.
 * Même recadrage que les logos restaurant (sharp fit: cover, position: center).
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..", "..");
const SVG = path.join(ROOT, "assets", "images", "icone", "logo.svg");

const OUTPUTS = [
  { dir: "frontend", name: "favicon-16x16.png", size: 16 },
  { dir: "frontend", name: "favicon-32x32.png", size: 32 },
  { dir: "frontend", name: "apple-touch-icon.png", size: 180 },
  { dir: "frontend", name: "android-chrome-192x192.png", size: 192 },
  { dir: "frontend", name: "android-chrome-512x512.png", size: 512 },
  { dir: path.join("assets", "images"), name: "apple-touch-icon.png", size: 180 },
];

async function renderIcon(size) {
  return sharp(SVG)
    .resize(size, size, {
      fit: "cover",
      position: "center",
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SVG)) {
    console.error(`SVG introuvable : ${SVG}`);
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
