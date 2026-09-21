const fs = require("fs");
const path = require("path");

/** Variantes générées à l'upload (convention : {base}-{width}w.webp) */
const VARIANT_WIDTHS = [128, 400, 800];

function getBaseNameFromWebpFilename(filename) {
  if (!filename || typeof filename !== "string") {
    return null;
  }
  var base = path.basename(filename.trim());
  if (!base.toLowerCase().endsWith(".webp")) {
    return null;
  }
  return base.slice(0, -".webp".length);
}

function variantFilename(baseName, width) {
  return baseName + "-" + width + "w.webp";
}

function variantUploadUrl(mainUploadUrl, width) {
  if (!mainUploadUrl || typeof mainUploadUrl !== "string") {
    return null;
  }
  var trimmed = mainUploadUrl.trim();
  if (trimmed.indexOf("/uploads/") !== 0 || !trimmed.toLowerCase().endsWith(".webp")) {
    return null;
  }
  var baseName = getBaseNameFromWebpFilename(trimmed.slice("/uploads/".length));
  if (!baseName || /-\d+w$/i.test(baseName)) {
    return null;
  }
  return "/uploads/" + variantFilename(baseName, width);
}

async function generateUploadVariants(originalPath, dir, baseName, sourceWidth, quality) {
  var created = [];
  var sharp = null;

  try {
    sharp = require("sharp");
  } catch (err) {
    return created;
  }

  if (!originalPath || !sourceWidth) {
    return created;
  }

  var pipeline = sharp(originalPath, { failOn: "error" }).rotate();

  for (var i = 0; i < VARIANT_WIDTHS.length; i += 1) {
    var width = VARIANT_WIDTHS[i];
    if (sourceWidth <= width) {
      continue;
    }
    var name = variantFilename(baseName, width);
    var outPath = path.join(dir, name);
    await pipeline
      .clone()
      .resize({ width: width, withoutEnlargement: true })
      .webp({ quality: quality, effort: 4 })
      .toFile(outPath);
    created.push(name);
  }

  return created;
}

async function deleteVariantsForUploadUrl(uploadUrl, uploadsDir) {
  var normalized = typeof uploadUrl === "string" ? uploadUrl.trim() : "";
  if (normalized.indexOf("/uploads/") !== 0) {
    return;
  }
  var baseName = getBaseNameFromWebpFilename(path.basename(normalized));
  if (!baseName) {
    return;
  }

  for (var i = 0; i < VARIANT_WIDTHS.length; i += 1) {
    var variantPath = path.join(uploadsDir, variantFilename(baseName, VARIANT_WIDTHS[i]));
    await fs.promises.unlink(variantPath).catch(function () {});
  }
}

module.exports = {
  VARIANT_WIDTHS,
  variantFilename,
  variantUploadUrl,
  generateUploadVariants,
  deleteVariantsForUploadUrl,
  getBaseNameFromWebpFilename,
};
