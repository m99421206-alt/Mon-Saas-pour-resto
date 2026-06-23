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
 * Le design n'est pas affecté : seule la taille de transfert change.
 * En cas d'échec (sharp absent, format non géré...), on conserve le fichier
 * d'origine pour ne jamais casser l'upload.
 */

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 78;
const MAX_INPUT_PIXELS = 8192 * 8192;

async function optimizeUploadedImage(file) {
  if (!sharp || !file || !file.path) {
    return { filename: file ? file.filename : null, optimized: false };
  }

  const originalPath = file.path;
  const dir = path.dirname(originalPath);
  const baseName = path.basename(file.filename, path.extname(file.filename));
  const webpName = baseName + ".webp";
  const webpPath = path.join(dir, webpName);

  try {
    const pipeline = sharp(originalPath, {
      failOn: "none",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).rotate();
    const metadata = await pipeline.metadata();

    if (metadata && metadata.width && metadata.width > MAX_WIDTH) {
      pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }

    await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(webpPath);

    if (webpPath !== originalPath) {
      fs.promises.unlink(originalPath).catch(function () {});
    }

    return { filename: webpName, optimized: true };
  } catch (err) {
    // Repli : on garde le fichier original tel quel.
    fs.promises.unlink(webpPath).catch(function () {});
    return { filename: file.filename, optimized: false };
  }
}

module.exports = { optimizeUploadedImage, MAX_WIDTH, WEBP_QUALITY, MAX_INPUT_PIXELS };
