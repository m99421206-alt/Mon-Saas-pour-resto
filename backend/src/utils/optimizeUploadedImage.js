const fs = require("fs");
const path = require("path");
const { generateUploadVariants } = require("./uploadImageVariants");

let sharp = null;
try {
  sharp = require("sharp");
} catch (err) {
  sharp = null;
}

/*
 * Optimisation d'image après upload :
 *  - redimensionne si l'image dépasse une largeur maximale (sans agrandir) ;
 *  - réencode en WebP compressé ;
 *  - génère des variantes 128w / 400w / 800w pour le menu public (srcset) ;
 *  - supprime le fichier d'origine.
 */

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 78;
const MAX_INPUT_PIXELS = 8192 * 8192;
const REJECT_MESSAGE =
  "Image invalide ou trop grande. Utilisez JPG, PNG ou WebP valide.";

async function cleanupPaths(originalPath, webpPath, variantPaths) {
  if (Array.isArray(variantPaths)) {
    for (var i = 0; i < variantPaths.length; i += 1) {
      await fs.promises.unlink(variantPaths[i]).catch(function () {});
    }
  }
  if (webpPath) {
    await fs.promises.unlink(webpPath).catch(function () {});
  }
  if (originalPath) {
    await fs.promises.unlink(originalPath).catch(function () {});
  }
}

async function rejectUploadedImage(originalPath, webpPath, variantPaths, message) {
  await cleanupPaths(originalPath, webpPath, variantPaths);
  return {
    rejected: true,
    message: message || REJECT_MESSAGE,
  };
}

async function optimizeUploadedImage(file) {
  if (!file || !file.path) {
    return { rejected: true, message: REJECT_MESSAGE };
  }

  const originalPath = file.path;

  if (!sharp) {
    return rejectUploadedImage(originalPath, null, null, REJECT_MESSAGE);
  }

  const dir = path.dirname(originalPath);
  const baseName = path.basename(file.filename, path.extname(file.filename));
  const webpName = baseName + ".webp";
  const webpPath = path.join(dir, webpName);
  var variantPaths = [];

  try {
    const pipeline = sharp(originalPath, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).rotate();
    const metadata = await pipeline.metadata();

    if (!metadata || !metadata.width || !metadata.height) {
      return rejectUploadedImage(originalPath, webpPath, null, REJECT_MESSAGE);
    }

    const sourceWidth = metadata.width;

    if (sourceWidth > MAX_WIDTH) {
      await pipeline
        .clone()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toFile(webpPath);
    } else {
      await pipeline
        .clone()
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toFile(webpPath);
    }

    const variantNames = await generateUploadVariants(
      originalPath,
      dir,
      baseName,
      sourceWidth,
      WEBP_QUALITY
    );
    variantPaths = variantNames.map(function (name) {
      return path.join(dir, name);
    });

    await fs.promises.unlink(originalPath).catch(function () {});

    return {
      filename: webpName,
      optimized: true,
      variants: variantNames,
    };
  } catch (err) {
    return rejectUploadedImage(originalPath, webpPath, variantPaths, REJECT_MESSAGE);
  }
}

module.exports = { optimizeUploadedImage, MAX_WIDTH, WEBP_QUALITY, MAX_INPUT_PIXELS };
