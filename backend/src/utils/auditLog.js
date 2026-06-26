/**
 * Journal d’audit plateforme — insertion best-effort (ne fait jamais échouer la route appelante).
 */

const { getPool } = require("../config/database");

var AUDIT_ACTIONS = {
  USER_LOGIN: "user.login",
  USER_LOGIN_FAILED: "user.login_failed",
  USER_REGISTER: "user.register",
  USER_SUSPEND: "user.suspend",
  USER_ACTIVATE: "user.activate",
  USER_DELETE: "user.delete",
  USER_PASSWORD_RESET: "user.password_reset",
  UPLOAD_IMAGE: "media.upload",
  UPLOAD_IMAGE_FAILED: "media.upload_failed",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  CATEGORY_CREATE: "category.create",
  CATEGORY_UPDATE: "category.update",
  CATEGORY_DELETE: "category.delete",
  RESTAURANT_MENU_SUSPEND: "restaurant.menu_suspend",
  RESTAURANT_MENU_RESUME: "restaurant.menu_resume",
  RESTAURANT_DELETE: "restaurant.delete",
  RESTAURANT_SETTINGS_UPDATE: "restaurant.settings_update",
  SUBSCRIPTION_ACTIVATE: "subscription.activate",
  SUBSCRIPTION_SUSPEND: "subscription.suspend",
  SUBSCRIPTION_RENEW: "subscription.renew",
  SUBSCRIPTION_ADJUST: "subscription.adjust",
  SETTINGS_UPDATE: "settings.update",
  ONBOARDING_SETUP_REQUEST: "onboarding.setup_request",
  SETUP_HELP_COMPLETE: "admin.setup_help_complete",
  ADMIN_RESTAURANT_DASHBOARD: "admin.restaurant_dashboard_access",
};

var ACTOR_TYPES = {
  ADMIN: "admin",
  RESTAURANT: "restaurant",
  SYSTEM: "system",
};

var LABEL_FALLBACK = {
  "user.login": "Connexion utilisateur",
  "user.login_failed": "Échec connexion utilisateur",
  "user.register": "Inscription nouveau compte",
  "user.suspend": "Suspension utilisateur",
  "user.activate": "Réactivation utilisateur",
  "user.delete": "Suppression utilisateur",
  "user.password_reset": "Réinitialisation mot de passe utilisateur",
  "media.upload": "Upload image",
  "media.upload_failed": "Upload image refusé",
  "product.create": "Ajout produit",
  "product.update": "Modification produit",
  "product.delete": "Suppression produit",
  "category.create": "Ajout catégorie",
  "category.update": "Modification catégorie",
  "category.delete": "Suppression catégorie",
  "restaurant.menu_suspend": "Suspension menu public",
  "restaurant.menu_resume": "Réactivation menu public",
  "restaurant.delete": "Suppression restaurant",
  "restaurant.settings_update": "Mise à jour paramètres restaurant",
  "subscription.activate": "Activation abonnement",
  "subscription.suspend": "Suspension abonnement",
  "subscription.renew": "Renouvellement abonnement",
  "subscription.adjust": "Ajustement durée ou plan",
  "settings.update": "Mise à jour paramètres plateforme",
  "onboarding.setup_request": "Demande d’accompagnement installation",
  "admin.setup_help_complete": "Installation marquée terminée (admin)",
  "admin.restaurant_dashboard_access": "Accès tableau de bord restaurant (admin)",
};

function labelForCode(code) {
  return LABEL_FALLBACK[code] || String(code || "Événement");
}

function normalizeActorType(value) {
  var raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === ACTOR_TYPES.ADMIN || raw === ACTOR_TYPES.RESTAURANT || raw === ACTOR_TYPES.SYSTEM) {
    return raw;
  }
  return null;
}

/**
 * Contexte d'audit issu du JWT (impersonation admin → restaurant).
 * @param {object} payload
 */
function resolveAuditContextFromJwtPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  var subjectUserId = Number(payload.userId);
  if (!Number.isInteger(subjectUserId) || subjectUserId < 1) {
    return null;
  }

  if (payload.purpose === "admin_dashboard_access") {
    var actorUserId = Number(payload.actorUserId);
    return {
      actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
      subjectUserId: subjectUserId,
      impersonation: true,
      actorType: ACTOR_TYPES.ADMIN,
    };
  }

  return {
    actorUserId: subjectUserId,
    subjectUserId: subjectUserId,
    impersonation: false,
    actorType: ACTOR_TYPES.RESTAURANT,
  };
}

function resolveAuditContextFromRequest(req) {
  if (req && req.auditContext) {
    return req.auditContext;
  }
  if (req && req.user && req.user.id) {
    return {
      actorUserId: req.user.id,
      subjectUserId: req.user.id,
      impersonation: false,
      actorType: ACTOR_TYPES.RESTAURANT,
    };
  }
  return null;
}

/**
 * @param {{ userId?: number|null, restaurantId?: number|null, action: string, detail?: string|null, impersonation?: boolean|number, subjectUserId?: number|null, actorType?: string|null }} params
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

    var impersonation = params.impersonation === true || params.impersonation === 1 ? 1 : 0;
    var subjectUid = params.subjectUserId != null ? Number(params.subjectUserId) : null;
    var subjectUserId =
      impersonation && Number.isInteger(subjectUid) && subjectUid > 0 ? subjectUid : null;
    var actorType = normalizeActorType(params.actorType);

    try {
      await pool.query(
        "INSERT INTO audit_logs (user_id, restaurant_id, action, detail, impersonation, subject_user_id, actor_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [userId, restaurantId, action, detail, impersonation, subjectUserId, actorType]
      );
      return;
    } catch (insertErr) {
      if (!(insertErr && (insertErr.code === "ER_BAD_FIELD_ERROR" || insertErr.errno === 1054))) {
        throw insertErr;
      }
    }

    await pool.query("INSERT INTO audit_logs (user_id, restaurant_id, action, detail) VALUES (?, ?, ?, ?)", [
      userId,
      restaurantId,
      action,
      detail,
    ]);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[audit_logs]", err.message || err);
    }
  }
}

/**
 * Journalise une action en tenant compte de l'impersonation admin (req.auditContext).
 * @param {import("express").Request} req
 * @param {{ restaurantId?: number|null, action: string, detail?: string|null, actorType?: string|null }} params
 */
async function appendAuditFromRequest(req, params) {
  var ctx = resolveAuditContextFromRequest(req);
  var merged = {
    action: params.action,
    detail: params.detail,
    restaurantId: params.restaurantId,
  };

  if (ctx && ctx.impersonation) {
    merged.userId = ctx.actorUserId;
    merged.subjectUserId = ctx.subjectUserId;
    merged.impersonation = true;
    merged.actorType = ACTOR_TYPES.ADMIN;
  } else if (ctx) {
    merged.userId = ctx.actorUserId;
    merged.impersonation = false;
    merged.actorType = normalizeActorType(params.actorType) || ctx.actorType || ACTOR_TYPES.RESTAURANT;
  } else {
    merged.userId = req && req.user ? req.user.id : null;
    merged.impersonation = false;
    merged.actorType = normalizeActorType(params.actorType) || ACTOR_TYPES.RESTAURANT;
  }

  return appendAudit(merged);
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
  appendAuditFromRequest: appendAuditFromRequest,
  AUDIT_ACTIONS: AUDIT_ACTIONS,
  ACTOR_TYPES: ACTOR_TYPES,
  labelForCode: labelForCode,
  getRestaurantIdForUserAudit: getRestaurantIdForUserAudit,
  resolveAuditContextFromJwtPayload: resolveAuditContextFromJwtPayload,
  resolveAuditContextFromRequest: resolveAuditContextFromRequest,
};
