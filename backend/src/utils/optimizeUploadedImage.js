const fs = require("fs");
const path = require("path");

let sharp = null;
try {
  sharp = require("sharp");
} catch (err) {
  sharp = null;
}

/*
 * Optimisation d'image après upload :
 *  - redimensionne si l'image dépasse une largeur maximale (sans agrandir) ;
 *  - réencode en WebP compressé pour réduire fortement le poids ;
 *  - supprime le fichier d'origine et renvoie le nouveau nom de fichier.
 *
 * Si Sharp ne peut pas décoder l'image (corrompue, trop grande, format invalide),
 * le fichier est supprimé et l'upload est refusé.
 */

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 78;
const MAX_INPUT_PIXELS = 8192 * 8192;
const REJECT_MESSAGE =
  "Image invalide ou trop grande. Utilisez JPG, PNG ou WebP valide.";

async function cleanupPaths(originalPath, webpPath) {
  if (webpPath) {
    await fs.promises.unlink(webpPath).catch(function () {});
  }
  if (originalPath) {
    await fs.promises.unlink(originalPath).catch(function () {});
  }
}

async function rejectUploadedImage(originalPath, webpPath, message) {
  await cleanupPaths(originalPath, webpPath);
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
    return rejectUploadedImage(originalPath, null, REJECT_MESSAGE);
  }

  const dir = path.dirname(originalPath);
  const baseName = path.basename(file.filename, path.extname(file.filename));
  const webpName = baseName + ".webp";
  const webpPath = path.join(dir, webpName);

  try {
    const pipeline = sharp(originalPath, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).rotate();
    const metadata = await pipeline.metadata();

    if (!metadata || !metadata.width || !metadata.height) {
      return rejectUploadedImage(originalPath, webpPath, REJECT_MESSAGE);
    }

    if (metadata.width > MAX_WIDTH) {
      pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }

    await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(webpPath);

    await fs.promises.unlink(originalPath).catch(function () {});

    return { filename: webpName, optimized: true };
  } catch (err) {
    return rejectUploadedImage(originalPath, webpPath, REJECT_MESSAGE);
  }
}

module.exports = { optimizeUploadedImage, MAX_WIDTH, WEBP_QUALITY, MAX_INPUT_PIXELS };
