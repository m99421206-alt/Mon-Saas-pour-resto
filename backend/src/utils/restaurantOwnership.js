/**
 * Vérification propriété restaurant — isolation des données multi-tenant.
 */

"use strict";

const { getPool } = require("../config/database");

var FORBIDDEN_MESSAGE =
  "Accès refusé : vous ne pouvez pas accéder aux données d'un autre restaurant.";

async function getRestaurantIdForUser(userId) {
  var restaurant = await getRestaurantForUser(userId);
  return restaurant ? restaurant.id : null;
}

async function getRestaurantForUser(userId) {
  var uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) {
    return null;
  }

  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT id, user_id, name, description, whatsapp, logo_url, banner_url, theme_color, slug FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
    [uid],
  );
  return rows.length ? rows[0] : null;
}

function parseRestaurantIdValue(value) {
  if (value == null || value === "") {
    return null;
  }
  var id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }
  return id;
}

/**
 * Extrait un restaurant_id explicite (params, query, body) — pas les IDs produit/catégorie.
 */
function parseRequestedRestaurantId(req) {
  var sources = [];

  if (req.params) {
    if (req.params.restaurantId != null) {
      sources.push(req.params.restaurantId);
    }
    if (req.params.restaurant_id != null) {
      sources.push(req.params.restaurant_id);
    }
  }

  if (req.query) {
    if (req.query.restaurant_id != null) {
      sources.push(req.query.restaurant_id);
    }
    if (req.query.restaurantId != null) {
      sources.push(req.query.restaurantId);
    }
  }

  if (req.body && typeof req.body === "object") {
    if (req.body.restaurant_id != null) {
      sources.push(req.body.restaurant_id);
    }
    if (req.body.restaurantId != null) {
      sources.push(req.body.restaurantId);
    }
  }

  for (var i = 0; i < sources.length; i += 1) {
    var parsed = parseRestaurantIdValue(sources[i]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function sendForbidden(res) {
  return res.status(403).json({ message: FORBIDDEN_MESSAGE });
}

/**
 * @returns {Promise<"ok"|"not_found"|"forbidden">}
 */
async function assertProductOwnedByRestaurant(productId, restaurantId) {
  var pid = Number(productId);
  var rid = Number(restaurantId);
  if (!Number.isInteger(pid) || pid < 1 || !Number.isInteger(rid) || rid < 1) {
    return "not_found";
  }

  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT restaurant_id FROM products WHERE id = ? LIMIT 1",
    [pid],
  );
  if (!rows.length) {
    return "not_found";
  }
  if (Number(rows[0].restaurant_id) !== rid) {
    return "forbidden";
  }
  return "ok";
}

/**
 * @returns {Promise<"ok"|"not_found"|"forbidden">}
 */
async function assertCategoryOwnedByRestaurant(categoryId, restaurantId) {
  var cid = Number(categoryId);
  var rid = Number(restaurantId);
  if (!Number.isInteger(cid) || cid < 1 || !Number.isInteger(rid) || rid < 1) {
    return "not_found";
  }

  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT restaurant_id FROM categories WHERE id = ? LIMIT 1",
    [cid],
  );
  if (!rows.length) {
    return "not_found";
  }
  if (Number(rows[0].restaurant_id) !== rid) {
    return "forbidden";
  }
  return "ok";
}

async function categoryBelongsToRestaurant(categoryId, restaurantId) {
  var status = await assertCategoryOwnedByRestaurant(categoryId, restaurantId);
  return status === "ok";
}

module.exports = {
  FORBIDDEN_MESSAGE: FORBIDDEN_MESSAGE,
  getRestaurantIdForUser: getRestaurantIdForUser,
  getRestaurantForUser: getRestaurantForUser,
  parseRequestedRestaurantId: parseRequestedRestaurantId,
  sendForbidden: sendForbidden,
  assertProductOwnedByRestaurant: assertProductOwnedByRestaurant,
  assertCategoryOwnedByRestaurant: assertCategoryOwnedByRestaurant,
  categoryBelongsToRestaurant: categoryBelongsToRestaurant,
};
