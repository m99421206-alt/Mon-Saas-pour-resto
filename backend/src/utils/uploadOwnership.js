const path = require("path");
const { getPool } = require("../config/database");

var UPLOAD_FORBIDDEN_MESSAGE =
  "Cette image appartient à un autre restaurant. Utilisez une image uploadée depuis votre compte.";

var DEFAULT_UPLOAD_MAX_IMAGES = 100;

function getUploadMaxImagesPerRestaurant() {
  var n = Number(process.env.UPLOAD_MAX_IMAGES_PER_RESTAURANT);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_UPLOAD_MAX_IMAGES;
  }
  return Math.min(1000, Math.round(n));
}

async function countRestaurantUploads(restaurantId) {
  var rid = Number(restaurantId);
  if (!Number.isInteger(rid) || rid < 1) {
    return 0;
  }

  try {
    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT COUNT(*) AS total FROM upload_files WHERE restaurant_id = ?",
      [rid]
    );
    return Number(rows[0].total) || 0;
  } catch (err) {
    if (isMissingUploadRegistry(err)) {
      return 0;
    }
    throw err;
  }
}

async function assertRestaurantUploadQuota(restaurantId) {
  var max = getUploadMaxImagesPerRestaurant();
  var count = await countRestaurantUploads(restaurantId);

  if (count >= max) {
    return {
      ok: false,
      count: count,
      max: max,
      message:
        "Limite atteinte : maximum " +
        max +
        " images par restaurant (" +
        count +
        "/" +
        max +
        "). Supprimez ou remplacez des photos existantes.",
    };
  }

  return { ok: true, count: count, max: max };
}

async function removeRegistryEntryForFilename(filename) {
  var name = String(filename || "").trim();
  if (!name) {
    return;
  }

  try {
    var pool = getPool();
    await pool.query("DELETE FROM upload_files WHERE filename = ? LIMIT 1", [name]);
  } catch (err) {
    if (!isMissingUploadRegistry(err)) {
      throw err;
    }
  }
}

async function removeRegistryEntryForUrl(uploadUrl) {
  var filename = getFilenameFromUploadUrl(uploadUrl);
  if (!filename) {
    return;
  }
  await removeRegistryEntryForFilename(filename);
}

function getFilenameFromUploadUrl(uploadUrl) {
  if (!uploadUrl || typeof uploadUrl !== "string" || uploadUrl.indexOf("/uploads/") !== 0) {
    return null;
  }
  var filename = path.basename(uploadUrl);
  return filename && filename === uploadUrl.slice("/uploads/".length) ? filename : null;
}

function isMissingUploadRegistry(err) {
  return err && (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146);
}

async function registerUploadForRestaurant(params) {
  var restaurantId = Number(params && params.restaurantId);
  var userId = Number(params && params.userId);
  var filename = String((params && params.filename) || "").trim();

  if (!Number.isInteger(restaurantId) || restaurantId < 1 || !filename) {
    return;
  }

  try {
    var pool = getPool();
    await pool.query(
      "INSERT INTO upload_files (restaurant_id, user_id, filename, url) VALUES (?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE restaurant_id = VALUES(restaurant_id), user_id = VALUES(user_id)",
      [restaurantId, Number.isInteger(userId) && userId > 0 ? userId : null, filename, "/uploads/" + filename]
    );
  } catch (err) {
    if (!isMissingUploadRegistry(err)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[upload_files]", err.message || err);
      }
    }
  }
}

async function isUploadUrlReferencedByOtherRestaurant(uploadUrl, restaurantId) {
  var rid = Number(restaurantId);
  if (!uploadUrl || !Number.isInteger(rid) || rid < 1) {
    return false;
  }

  var pool = getPool();

  var [[productRow]] = await pool.query(
    "SELECT COUNT(*) AS n FROM products WHERE image = ? AND restaurant_id <> ?",
    [uploadUrl, rid]
  );
  if (Number(productRow.n) > 0) {
    return true;
  }

  var [[variantRow]] = await pool.query(
    "SELECT COUNT(*) AS n FROM product_variants pv " +
      "INNER JOIN products p ON p.id = pv.product_id " +
      "WHERE pv.image = ? AND p.restaurant_id <> ?",
    [uploadUrl, rid]
  );
  if (Number(variantRow.n) > 0) {
    return true;
  }

  var [[restaurantRow]] = await pool.query(
    "SELECT COUNT(*) AS n FROM restaurants WHERE (logo_url = ? OR banner_url = ?) AND id <> ?",
    [uploadUrl, uploadUrl, rid]
  );
  return Number(restaurantRow.n) > 0;
}

async function assertUploadUrlAllowedForRestaurant(uploadUrl, restaurantId) {
  var filename = getFilenameFromUploadUrl(uploadUrl);
  if (!filename) {
    return "invalid";
  }

  var rid = Number(restaurantId);
  if (!Number.isInteger(rid) || rid < 1) {
    return "forbidden";
  }

  try {
    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT restaurant_id FROM upload_files WHERE filename = ? LIMIT 1",
      [filename]
    );

    // Rétrocompatibilité : pas d'entrée registry — refuser si l'URL est déjà utilisée ailleurs.
    if (!rows.length) {
      if (await isUploadUrlReferencedByOtherRestaurant(uploadUrl, rid)) {
        return "forbidden";
      }
      return "legacy";
    }

    return Number(rows[0].restaurant_id) === rid ? "ok" : "forbidden";
  } catch (err) {
    if (isMissingUploadRegistry(err)) {
      return "legacy";
    }
    throw err;
  }
}

/**
 * Vérifie une ou plusieurs URLs d'upload avant enregistrement.
 * @param {string|string[]|null|undefined} uploadUrls
 * @param {number} restaurantId
 * @returns {Promise<"ok"|"invalid"|"forbidden">}
 */
async function assertUploadUrlsAllowedForRestaurant(uploadUrls, restaurantId) {
  var list = [];
  if (Array.isArray(uploadUrls)) {
    list = uploadUrls;
  } else if (uploadUrls) {
    list = [uploadUrls];
  }

  for (var i = 0; i < list.length; i += 1) {
    var url = list[i];
    if (!url) {
      continue;
    }
    var status = await assertUploadUrlAllowedForRestaurant(url, restaurantId);
    if (status === "forbidden" || status === "invalid") {
      return status;
    }
  }

  return "ok";
}

function sendUploadForbidden(res) {
  return res.status(403).json({ message: UPLOAD_FORBIDDEN_MESSAGE });
}

module.exports = {
  UPLOAD_FORBIDDEN_MESSAGE: UPLOAD_FORBIDDEN_MESSAGE,
  DEFAULT_UPLOAD_MAX_IMAGES: DEFAULT_UPLOAD_MAX_IMAGES,
  getUploadMaxImagesPerRestaurant: getUploadMaxImagesPerRestaurant,
  countRestaurantUploads: countRestaurantUploads,
  assertRestaurantUploadQuota: assertRestaurantUploadQuota,
  removeRegistryEntryForUrl: removeRegistryEntryForUrl,
  registerUploadForRestaurant: registerUploadForRestaurant,
  assertUploadUrlAllowedForRestaurant: assertUploadUrlAllowedForRestaurant,
  assertUploadUrlsAllowedForRestaurant: assertUploadUrlsAllowedForRestaurant,
  sendUploadForbidden: sendUploadForbidden,
};
