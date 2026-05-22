/**
 * Journal d’audit plateforme — insertion best-effort (ne fait jamais échouer la route appelante).
 */

const { getPool } = require("../config/database");

var AUDIT_ACTIONS = {
  USER_LOGIN: "user.login",
  USER_REGISTER: "user.register",
  USER_SUSPEND: "user.suspend",
  USER_ACTIVATE: "user.activate",
  USER_DELETE: "user.delete",
  UPLOAD_IMAGE: "media.upload",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  CATEGORY_CREATE: "category.create",
  CATEGORY_UPDATE: "category.update",
  CATEGORY_DELETE: "category.delete",
  RESTAURANT_MENU_SUSPEND: "restaurant.menu_suspend",
  RESTAURANT_MENU_RESUME: "restaurant.menu_resume",
  RESTAURANT_DELETE: "restaurant.delete",
};

var LABEL_FALLBACK = {
  "user.login": "Connexion utilisateur",
  "user.register": "Inscription nouveau compte",
  "user.suspend": "Suspension utilisateur",
  "user.activate": "Réactivation utilisateur",
  "user.delete": "Suppression utilisateur",
  "media.upload": "Upload image",
  "product.create": "Ajout produit",
  "product.update": "Modification produit",
  "product.delete": "Suppression produit",
  "category.create": "Ajout catégorie",
  "category.update": "Modification catégorie",
  "category.delete": "Suppression catégorie",
  "restaurant.menu_suspend": "Suspension menu public",
  "restaurant.menu_resume": "Réactivation menu public",
  "restaurant.delete": "Suppression restaurant",
};

function labelForCode(code) {
  return LABEL_FALLBACK[code] || String(code || "Événement");
}

/**
 * @param {{ userId?: number|null, restaurantId?: number|null, action: string, detail?: string|null }} params
 */
async function appendAudit(params) {
  try {
    var pool = getPool();
    var action = String(params.action || "").trim().slice(0, 96);
    if (!action) {
      return;
    }

    var uid = params.userId != null ? Number(params.userId) : null;
    var rid = params.restaurantId != null ? Number(params.restaurantId) : null;
    var userId = Number.isInteger(uid) && uid > 0 ? uid : null;
    var restaurantId = Number.isInteger(rid) && rid > 0 ? rid : null;
    var detail = params.detail != null ? String(params.detail).trim().slice(0, 2048) : null;
    if (detail === "") {
      detail = null;
    }

    await pool.query(
      "INSERT INTO audit_logs (user_id, restaurant_id, action, detail) VALUES (?, ?, ?, ?)",
      [userId, restaurantId, action, detail]
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[audit_logs]", err.message || err);
    }
  }
}

async function getRestaurantIdForUserAudit(userId) {
  try {
    var id = Number(userId);
    if (!Number.isInteger(id) || id < 1) {
      return null;
    }
    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      [id]
    );
    return rows.length ? rows[0].id : null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  appendAudit: appendAudit,
  AUDIT_ACTIONS: AUDIT_ACTIONS,
  labelForCode: labelForCode,
  getRestaurantIdForUserAudit: getRestaurantIdForUserAudit,
};
