/**
 * Notifications administrateur plateforme — création best-effort + requêtes liste.
 */

const { getPool } = require("../config/database");

var NOTIFICATION_TYPES = {
  PASSWORD_RESET: "password_reset",
  SUPPORT: "support",
  REGISTRATION: "registration",
  NEW_RESTAURANT: "new_restaurant",
  SUBSCRIPTION: "subscription",
  ISSUE: "issue",
};

var TYPE_LABELS = {
  password_reset: "Réinitialisation mot de passe",
  support: "Message support",
  registration: "Nouveau compte créé",
  new_restaurant: "Nouveau restaurant inscrit",
  subscription: "Demande d'abonnement",
  issue: "Signalement problème",
};

var TYPE_LINKS = {
  password_reset: "admin-users.html",
  support: "admin-dashboard.html",
  registration: "admin-users.html",
  new_restaurant: "admin-restaurants.html",
  subscription: "admin-subscriptions.html",
  issue: "admin-notifications.html",
};

var VALID_TYPES = Object.keys(TYPE_LABELS);

var VALID_FILTERS = ["all", "unread", "password_reset", "support", "subscription", "registration"];

function labelForType(type) {
  return TYPE_LABELS[type] || String(type || "Notification");
}

function linkForType(type) {
  return TYPE_LINKS[type] || "admin-notifications.html";
}

function parsePositiveInt(value, fallback) {
  var n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return fallback;
  }
  return n;
}

function normalizeFilter(value) {
  var key = String(value || "all").trim().toLowerCase();
  return VALID_FILTERS.indexOf(key) !== -1 ? key : "all";
}

function isMissingTableError(err) {
  return err && (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146);
}

/**
 * @param {{ type: string, restaurantId?: number|null, userId?: number|null, restaurantName?: string, phone?: string|null, detail?: string|null, linkUrl?: string|null }} params
 */
async function createAdminNotification(params) {
  try {
    var type = String(params.type || "").trim().toLowerCase();
    if (VALID_TYPES.indexOf(type) === -1) {
      return null;
    }

    var pool = getPool();
    var restaurantId = params.restaurantId != null ? Number(params.restaurantId) : null;
    var userId = params.userId != null ? Number(params.userId) : null;
    var rid = Number.isInteger(restaurantId) && restaurantId > 0 ? restaurantId : null;
    var uid = Number.isInteger(userId) && userId > 0 ? userId : null;
    var restaurantName = String(params.restaurantName || "").trim().slice(0, 160) || "—";
    var phone = params.phone != null ? String(params.phone).trim().slice(0, 32) : null;
    if (phone === "") {
      phone = null;
    }
    var detail = params.detail != null ? String(params.detail).trim().slice(0, 2048) : null;
    if (detail === "") {
      detail = null;
    }
    var linkUrl = params.linkUrl != null ? String(params.linkUrl).trim().slice(0, 255) : linkForType(type);

    var [result] = await pool.query(
      "INSERT INTO admin_notifications " +
        "(type, restaurant_id, user_id, restaurant_name, phone, detail, link_url, is_read) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
      [type, rid, uid, restaurantName, phone, detail, linkUrl],
    );

    return {
      id: result.insertId,
      type: type,
    };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[admin_notifications]", err.message || err);
    }
    return null;
  }
}

function mapRow(row) {
  var type = String(row.type || "");
  return {
    id: row.id,
    type: type,
    type_label: labelForType(type),
    restaurant_id: row.restaurant_id != null ? Number(row.restaurant_id) : null,
    user_id: row.user_id != null ? Number(row.user_id) : null,
    restaurant_name: String(row.restaurant_name || "—"),
    phone: row.phone != null ? String(row.phone) : null,
    detail: row.detail != null ? String(row.detail) : null,
    link_url: row.link_url ? String(row.link_url) : linkForType(type),
    is_read: Boolean(row.is_read),
    at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function buildWhereClause(filterKey) {
  var filter = normalizeFilter(filterKey);
  if (filter === "unread") {
    return { sql: "WHERE n.is_read = 0", vals: [], filter: filter };
  }
  if (filter === "password_reset") {
    return { sql: "WHERE n.type = ?", vals: ["password_reset"], filter: filter };
  }
  if (filter === "support") {
    return { sql: "WHERE n.type = ?", vals: ["support"], filter: filter };
  }
  if (filter === "subscription") {
    return { sql: "WHERE n.type = ?", vals: ["subscription"], filter: filter };
  }
  if (filter === "registration") {
    return { sql: "WHERE n.type IN (?, ?)", vals: ["registration", "new_restaurant"], filter: filter };
  }
  return { sql: "WHERE 1=1", vals: [], filter: "all" };
}

async function listNotifications(options) {
  options = options || {};
  var pool = getPool();
  var page = parsePositiveInt(options.page, 1);
  var pageSize = Math.min(parsePositiveInt(options.pageSize, 20), 100);
  var offset = (page - 1) * pageSize;
  var built = buildWhereClause(options.filter);

  var [[countRow]] = await pool.query(
    "SELECT COUNT(*) AS n FROM admin_notifications n " + built.sql,
    built.vals.slice(),
  );
  var total = Number(countRow.n) || 0;
  var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  var listVals = built.vals.slice();
  listVals.push(pageSize, offset);

  var [rows] = await pool.query(
    "SELECT n.id, n.type, n.restaurant_id, n.user_id, n.restaurant_name, n.phone, n.detail, n.link_url, n.is_read, n.created_at " +
      "FROM admin_notifications n " +
      built.sql +
      " ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?",
    listVals,
  );

  return {
    notifications: rows.map(mapRow),
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages,
    filter: built.filter,
  };
}

async function getUnreadCount() {
  var pool = getPool();
  var [[row]] = await pool.query("SELECT COUNT(*) AS n FROM admin_notifications WHERE is_read = 0");
  return Number(row.n) || 0;
}

async function listRecentNotifications(limit) {
  var pool = getPool();
  var n = Math.min(parsePositiveInt(limit, 8), 20);
  var [rows] = await pool.query(
    "SELECT n.id, n.type, n.restaurant_id, n.user_id, n.restaurant_name, n.phone, n.detail, n.link_url, n.is_read, n.created_at " +
      "FROM admin_notifications n ORDER BY n.is_read ASC, n.created_at DESC, n.id DESC LIMIT ?",
    [n],
  );
  return rows.map(mapRow);
}

async function markNotificationRead(id) {
  var pool = getPool();
  var nid = Number(id);
  if (!Number.isInteger(nid) || nid < 1) {
    return false;
  }
  var [result] = await pool.query("UPDATE admin_notifications SET is_read = 1 WHERE id = ? LIMIT 1", [nid]);
  return result.affectedRows > 0;
}

async function markAllNotificationsRead() {
  var pool = getPool();
  var [result] = await pool.query("UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0");
  return Number(result.affectedRows) || 0;
}

async function deleteNotification(id) {
  var pool = getPool();
  var nid = Number(id);
  if (!Number.isInteger(nid) || nid < 1) {
    return false;
  }
  var [result] = await pool.query("DELETE FROM admin_notifications WHERE id = ? LIMIT 1", [nid]);
  return result.affectedRows > 0;
}

module.exports = {
  NOTIFICATION_TYPES: NOTIFICATION_TYPES,
  TYPE_LABELS: TYPE_LABELS,
  labelForType: labelForType,
  linkForType: linkForType,
  createAdminNotification: createAdminNotification,
  listNotifications: listNotifications,
  getUnreadCount: getUnreadCount,
  listRecentNotifications: listRecentNotifications,
  markNotificationRead: markNotificationRead,
  markAllNotificationsRead: markAllNotificationsRead,
  deleteNotification: deleteNotification,
  isMissingTableError: isMissingTableError,
};
