const fs = require("fs/promises");
const path = require("path");
const { getPool } = require("../config/database");

const uploadsDir = path.join(__dirname, "../../uploads");

function normalizeUploadUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  var trimmed = url.trim();
  return trimmed.indexOf("/uploads/") === 0 ? trimmed : null;
}

function getUploadPath(uploadUrl) {
  var filename = path.basename(uploadUrl);
  return path.join(uploadsDir, filename);
}

async function countImageReferences(uploadUrl) {
  var pool = getPool();
  var [productRows] = await pool.query("SELECT COUNT(*) AS total FROM products WHERE image = ?", [uploadUrl]);
  var [variantRows] = await pool.query("SELECT COUNT(*) AS total FROM product_variants WHERE image = ?", [uploadUrl]);
  var [restaurantRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM restaurants WHERE logo_url = ? OR banner_url = ?",
    [uploadUrl, uploadUrl]
  );

  return Number(productRows[0].total) + Number(variantRows[0].total) + Number(restaurantRows[0].total);
}

async function removeUnusedUpload(uploadUrl) {
  var normalizedUrl = normalizeUploadUrl(uploadUrl);
  if (!normalizedUrl) {
    return;
  }

  var references = await countImageReferences(normalizedUrl);
  if (references > 0) {
    return;
  }

  try {
    await fs.unlink(getUploadPath(normalizedUrl));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeUnusedUploads(uploadUrls) {
  var uniqueUrls = Array.from(
    new Set(
      (uploadUrls || [])
        .map(normalizeUploadUrl)
        .filter(Boolean)
    )
  );

  for (var i = 0; i < uniqueUrls.length; i += 1) {
    await removeUnusedUpload(uniqueUrls[i]);
  }
}

module.exports = {
  removeUnusedUpload: removeUnusedUpload,
  removeUnusedUploads: removeUnusedUploads,
};
