const fs = require("fs/promises");
const path = require("path");
const { getPool } = require("../config/database");
const { removeRegistryEntryForUrl } = require("./uploadOwnership");
const { deleteVariantsForUploadUrl } = require("./uploadImageVariants");

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
    await deleteVariantsForUploadUrl(normalizedUrl, uploadsDir);
    await removeRegistryEntryForUrl(normalizedUrl);
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

function isMissingUploadRegistry(err) {
  return err && (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146);
}

function addUploadUrl(urlSet, url) {
  var normalized = normalizeUploadUrl(url);
  if (normalized) {
    urlSet.add(normalized);
  }
}

async function collectRestaurantUploadUrls(restaurantId) {
  var rid = Number(restaurantId);
  if (!Number.isInteger(rid) || rid < 1) {
    return [];
  }

  var pool = getPool();
  var urls = new Set();

  try {
    var [registryRows] = await pool.query(
      "SELECT url FROM upload_files WHERE restaurant_id = ?",
      [rid]
    );
    for (var i = 0; i < registryRows.length; i += 1) {
      addUploadUrl(urls, registryRows[i].url);
    }
  } catch (err) {
    if (!isMissingUploadRegistry(err)) {
      throw err;
    }
  }

  var [[restaurant]] = await pool.query(
    "SELECT logo_url, banner_url FROM restaurants WHERE id = ? LIMIT 1",
    [rid]
  );
  if (restaurant) {
    addUploadUrl(urls, restaurant.logo_url);
    addUploadUrl(urls, restaurant.banner_url);
  }

  var [productRows] = await pool.query(
    "SELECT image FROM products WHERE restaurant_id = ? AND image IS NOT NULL AND image <> ''",
    [rid]
  );
  for (var p = 0; p < productRows.length; p += 1) {
    addUploadUrl(urls, productRows[p].image);
  }

  var [variantRows] = await pool.query(
    "SELECT pv.image FROM product_variants pv " +
      "INNER JOIN products p ON p.id = pv.product_id " +
      "WHERE p.restaurant_id = ? AND pv.image IS NOT NULL AND pv.image <> ''",
    [rid]
  );
  for (var v = 0; v < variantRows.length; v += 1) {
    addUploadUrl(urls, variantRows[v].image);
  }

  return Array.from(urls);
}

async function collectUserRestaurantsUploadUrls(userId) {
  var uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) {
    return [];
  }

  var pool = getPool();
  var [restaurants] = await pool.query("SELECT id FROM restaurants WHERE user_id = ?", [uid]);
  var urls = new Set();

  for (var i = 0; i < restaurants.length; i += 1) {
    var restaurantUrls = await collectRestaurantUploadUrls(restaurants[i].id);
    for (var j = 0; j < restaurantUrls.length; j += 1) {
      urls.add(restaurantUrls[j]);
    }
  }

  return Array.from(urls);
}

async function forceDeleteUploadFiles(uploadUrls) {
  var uniqueUrls = Array.from(
    new Set(
      (uploadUrls || [])
        .map(normalizeUploadUrl)
        .filter(Boolean)
    )
  );

  var deleted = 0;
  var missing = 0;
  var failed = 0;

  for (var i = 0; i < uniqueUrls.length; i += 1) {
    var uploadUrl = uniqueUrls[i];
    try {
      await fs.unlink(getUploadPath(uploadUrl));
      await deleteVariantsForUploadUrl(uploadUrl, uploadsDir);
      deleted += 1;
    } catch (error) {
      if (error.code === "ENOENT") {
        missing += 1;
      } else {
        failed += 1;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[uploadCleanup] suppression impossible :", uploadUrl, error.message || error);
        }
      }
    }

    try {
      await removeRegistryEntryForUrl(uploadUrl);
    } catch (registryErr) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[uploadCleanup] registre :", uploadUrl, registryErr.message || registryErr);
      }
    }
  }

  return {
    total: uniqueUrls.length,
    deleted: deleted,
    missing: missing,
    failed: failed,
  };
}

module.exports = {
  removeUnusedUpload: removeUnusedUpload,
  removeUnusedUploads: removeUnusedUploads,
  collectRestaurantUploadUrls: collectRestaurantUploadUrls,
  collectUserRestaurantsUploadUrls: collectUserRestaurantsUploadUrls,
  forceDeleteUploadFiles: forceDeleteUploadFiles,
};
