const path = require("path");
const { getPool } = require("../config/database");

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

    // Rétrocompatibilité : les anciennes images n'ont pas encore d'entrée registry.
    if (!rows.length) {
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

module.exports = {
  registerUploadForRestaurant: registerUploadForRestaurant,
  assertUploadUrlAllowedForRestaurant: assertUploadUrlAllowedForRestaurant,
};
