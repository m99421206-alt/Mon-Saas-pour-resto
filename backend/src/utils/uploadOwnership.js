const path = require("path");
const { getPool } = require("../config/database");

var UPLOAD_FORBIDDEN_MESSAGE =
  "Cette image appartient à un autre restaurant. Utilisez une image uploadée depuis votre compte.";

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
  registerUploadForRestaurant: registerUploadForRestaurant,
  assertUploadUrlAllowedForRestaurant: assertUploadUrlAllowedForRestaurant,
  assertUploadUrlsAllowedForRestaurant: assertUploadUrlsAllowedForRestaurant,
  sendUploadForbidden: sendUploadForbidden,
};
