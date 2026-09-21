/**
 * Génère les variantes -128w / -400w / -800w pour les WebP existants dans backend/uploads/.
 * Usage : node backend/scripts/generate-upload-variants.js
 */
const fs = require("fs");
const path = require("path");
const {
  VARIANT_WIDTHS,
  variantFilename,
  getBaseNameFromWebpFilename,
} = require("../src/utils/uploadImageVariants");

const uploadsDir = path.join(__dirname, "../uploads");
const WEBP_QUALITY = 78;

let sharp = null;
try {
  sharp = require("sharp");
} catch (err) {
  console.error("Sharp requis : npm install (dans backend/)");
  process.exit(1);
}

function isMainWebp(filename) {
  if (!filename.toLowerCase().endsWith(".webp")) {
    return false;
  }
  return !/-\d+w\.webp$/i.test(filename);
}

async function processFile(filename) {
  var baseName = getBaseNameFromWebpFilename(filename);
  if (!baseName) {
    return { skipped: true };
  }

  var inputPath = path.join(uploadsDir, filename);
  var meta = await sharp(inputPath).metadata();
  var sourceWidth = meta.width || 0;
  var created = 0;

  for (var i = 0; i < VARIANT_WIDTHS.length; i += 1) {
    var width = VARIANT_WIDTHS[i];
    if (sourceWidth <= width) {
      continue;
    }
    var outName = variantFilename(baseName, width);
    var outPath = path.join(uploadsDir, outName);
    await sharp(inputPath)
      .rotate()
      .resize({ width: width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toFile(outPath);
    created += 1;
  }

  return { created: created, width: sourceWidth };
}

async function main() {
  var files = await fs.promises.readdir(uploadsDir);
  var mains = files.filter(isMainWebp);
  var stats = { processed: 0, variants: 0, errors: 0 };

  for (var i = 0; i < mains.length; i += 1) {
    try {
      var result = await processFile(mains[i]);
      if (!result.skipped) {
        stats.processed += 1;
        stats.variants += result.created || 0;
        console.log(mains[i] + " → " + (result.created || 0) + " variante(s)");
      }
    } catch (err) {
      stats.errors += 1;
      console.warn("Erreur " + mains[i] + ":", err.message || err);
    }
  }

  console.log(
    "Terminé : " +
      stats.processed +
      " image(s), " +
      stats.variants +
      " variante(s), " +
      stats.errors +
      " erreur(s)."
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
