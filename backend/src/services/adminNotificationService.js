/**
 * Notifications administrateur plateforme — création best-effort + requêtes liste.
 * Regroupe les événements similaires (support, etc.) par restaurant tant qu'ils sont non lus.
 */

const { getPool } = require("../config/database");
const subscriptionService = require("./subscriptionService");

var GROUP_PREFIX = "__MG_G__";

var NOTIFICATION_TYPES = {
  PASSWORD_RESET: "password_reset",
  SUPPORT: "support",
  NEW_RESTAURANT: "new_restaurant",
  PAYMENT_RECEIVED: "payment_received",
  SUBSCRIPTION_EXPIRING: "subscription_expiring",
  SUBSCRIPTION_EXPIRED: "subscription_expired",
  /** @deprecated conservé pour affichage des lignes historiques */
  REGISTRATION: "registration",
  /** @deprecated */
  SUBSCRIPTION: "subscription",
  /** @deprecated */
  ISSUE: "issue",
};

/** Types autorisés à la création (centre de notifications). */
var CENTER_TYPES = [
  NOTIFICATION_TYPES.PASSWORD_RESET,
  NOTIFICATION_TYPES.SUPPORT,
  NOTIFICATION_TYPES.NEW_RESTAURANT,
  NOTIFICATION_TYPES.PAYMENT_RECEIVED,
  NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
  NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
];

/** Types qui incrémentent un compteur au lieu de créer une nouvelle ligne. */
var GROUPABLE_TYPES = [NOTIFICATION_TYPES.SUPPORT, NOTIFICATION_TYPES.PASSWORD_RESET];

var TYPE_LABELS = {
  password_reset: "Réinitialisation mot de passe",
  support: "Message support",
  new_restaurant: "Nouveau restaurant inscrit",
  payment_received: "Paiement reçu",
  subscription_expiring: "Abonnement expire bientôt",
  subscription_expired: "Abonnement expiré",
  registration: "Nouveau compte créé",
  subscription: "Demande d'abonnement",
  issue: "Signalement problème",
};

var TYPE_LINKS = {
  password_reset: "admin-users.html",
  support: "admin-dashboard.html",
  new_restaurant: "admin-restaurants.html",
  payment_received: "admin-subscriptions.html",
  subscription_expiring: "admin-subscriptions.html",
  subscription_expired: "admin-subscriptions.html",
  registration: "admin-users.html",
  subscription: "admin-subscriptions.html",
  issue: "admin-notifications.html",
};

var VALID_FILTERS = [
  "all",
  "unread",
  "password_reset",
  "support",
  "subscription",
  "registration",
];

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

function isMissingColumnError(err) {
  return err && (err.code === "ER_BAD_FIELD_ERROR" || err.errno === 1054);
}

function nowIso() {
  return new Date().toISOString();
}

function parseGroupStorage(detail) {
  if (!detail || typeof detail !== "string") {
    return {
      count: 1,
      messages: detail ? [{ m: String(detail), at: null }] : [],
      plain: detail ? String(detail) : null,
      lastAt: null,
    };
  }
  if (detail.indexOf(GROUP_PREFIX) === 0) {
    try {
      var parsed = JSON.parse(detail.slice(GROUP_PREFIX.length));
      var messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      return {
        count: Math.max(1, Number(parsed.count) || messages.length || 1),
        messages: messages,
        plain: null,
        lastAt: parsed.lastAt || (messages.length ? messages[messages.length - 1].at : null),
      };
    } catch (e) {
      /* format legacy */
    }
  }
  return {
    count: 1,
    messages: [{ m: detail, at: null }],
    plain: detail,
    lastAt: null,
  };
}

function encodeGroupStorage(messages) {
  var msgs = messages.slice(-50);
  var lastAt = msgs.length ? msgs[msgs.length - 1].at || nowIso() : nowIso();
  return (
    GROUP_PREFIX +
    JSON.stringify({
      count: msgs.length,
      messages: msgs,
      lastAt: lastAt,
    })
  );
}

function buildGroupSummary(type, count, lastMessage) {
  var n = Math.max(1, count);
  if (type === NOTIFICATION_TYPES.SUPPORT) {
    return (
      n +
      " nouvelle" +
      (n > 1 ? "s" : "") +
      " demande" +
      (n > 1 ? "s" : "") +
      " de support"
    );
  }
  if (type === NOTIFICATION_TYPES.PASSWORD_RESET) {
    return (
      n +
      " demande" +
      (n > 1 ? "s" : "") +
      " de réinitialisation de mot de passe"
    );
  }
  if (lastMessage) {
    return lastMessage;
  }
  return null;
}

function mapRow(row) {
  var type = String(row.type || "");
  var group = parseGroupStorage(row.detail);
  var groupCount = Math.max(group.count, group.messages.length || 0, 1);
  var isGrouped = groupCount > 1;
  var lastMsg = group.messages.length ? group.messages[group.messages.length - 1] : null;
  var displayAt =
    group.lastAt ||
    (row.updated_at ? new Date(row.updated_at).toISOString() : null) ||
    (row.created_at ? new Date(row.created_at).toISOString() : null);

  var summaryDetail = group.plain;
  if (isGrouped) {
    summaryDetail = buildGroupSummary(type, groupCount, lastMsg ? lastMsg.m : null);
  }

  return {
    id: row.id,
    type: type,
    type_label: labelForType(type),
    restaurant_id: row.restaurant_id != null ? Number(row.restaurant_id) : null,
    user_id: row.user_id != null ? Number(row.user_id) : null,
    restaurant_name: String(row.restaurant_name || "—"),
    phone: row.phone != null ? String(row.phone) : null,
    detail: summaryDetail || group.plain || (lastMsg ? lastMsg.m : null),
    last_message: lastMsg ? String(lastMsg.m) : group.plain || null,
    group_count: groupCount,
    is_grouped: isGrouped,
    grouped_messages: group.messages.map(function (item) {
      return {
        message: String(item.m || ""),
        at: item.at || null,
      };
    }),
    link_url: row.link_url ? String(row.link_url) : linkForType(type),
    is_read: Boolean(row.is_read),
    at: displayAt,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function findUnreadForDedupe(type, restaurantId, phone, restaurantName) {
  var pool = getPool();
  var sql =
    "SELECT id, detail, created_at FROM admin_notifications WHERE type = ? AND is_read = 0";
  var vals = [type];

  if (Number.isInteger(restaurantId) && restaurantId > 0) {
    sql += " AND restaurant_id = ?";
    vals.push(restaurantId);
  } else if (type === NOTIFICATION_TYPES.PASSWORD_RESET) {
    if (phone) {
      sql += " AND phone = ?";
      vals.push(String(phone).slice(0, 32));
      if (restaurantName) {
        sql += " AND restaurant_name = ?";
        vals.push(String(restaurantName).slice(0, 160));
      }
    } else if (restaurantName) {
      sql += " AND restaurant_id IS NULL AND restaurant_name = ?";
      vals.push(String(restaurantName).slice(0, 160));
    } else {
      return null;
    }
  } else {
    return null;
  }

  sql += " ORDER BY id DESC LIMIT 1";
  var [rows] = await pool.query(sql, vals);
  return rows.length ? rows[0] : null;
}

async function touchUpdatedAt(pool, id, detail) {
  try {
    await pool.query(
      "UPDATE admin_notifications SET detail = ?, updated_at = NOW() WHERE id = ? LIMIT 1",
      [detail, id],
    );
  } catch (err) {
    if (isMissingColumnError(err)) {
      await pool.query("UPDATE admin_notifications SET detail = ? WHERE id = ? LIMIT 1", [detail, id]);
    } else {
      throw err;
    }
  }
}

async function appendGroupedNotification(existingRow, newMessage) {
  var pool = getPool();
  var group = parseGroupStorage(existingRow.detail);
  var msg = String(newMessage || "").trim().slice(0, 1500);
  if (!msg) {
    msg = "Nouvelle demande";
  }
  group.messages.push({ m: msg, at: nowIso() });
  var encoded = encodeGroupStorage(group.messages);
  await touchUpdatedAt(pool, existingRow.id, encoded);
  return { id: existingRow.id, type: existingRow.type || null, updated: true };
}

async function upsertSingletonNotification(params, type, rid, uid, restaurantName, phone, detail, linkUrl) {
  var pool = getPool();
  if (!rid) {
    return insertNotification(pool, type, rid, uid, restaurantName, phone, detail, linkUrl);
  }

  var existing = await findUnreadForDedupe(type, rid, phone, restaurantName);
  if (existing) {
    await touchUpdatedAt(pool, existing.id, detail);
    if (phone) {
      await pool.query("UPDATE admin_notifications SET phone = ? WHERE id = ? LIMIT 1", [
        phone,
        existing.id,
      ]);
    }
    return { id: existing.id, type: type, updated: true };
  }

  return insertNotification(pool, type, rid, uid, restaurantName, phone, detail, linkUrl);
}

async function insertNotification(pool, type, rid, uid, restaurantName, phone, detail, linkUrl) {
  var [result] = await pool.query(
    "INSERT INTO admin_notifications " +
      "(type, restaurant_id, user_id, restaurant_name, phone, detail, link_url, is_read) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
    [type, rid, uid, restaurantName, phone, detail, linkUrl],
  );
  return { id: result.insertId, type: type, updated: false };
}

/**
 * @param {{ type: string, restaurantId?: number|null, userId?: number|null, restaurantName?: string, phone?: string|null, detail?: string|null, linkUrl?: string|null }} params
 */
async function createAdminNotification(params) {
  try {
    var type = String(params.type || "")
      .trim()
      .toLowerCase();
    if (CENTER_TYPES.indexOf(type) === -1) {
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

    if (GROUPABLE_TYPES.indexOf(type) !== -1) {
      var existingGrouped = await findUnreadForDedupe(type, rid, phone, restaurantName);
      if (existingGrouped) {
        return await appendGroupedNotification(existingGrouped, detail || labelForType(type));
      }
      var initialMsg = detail || labelForType(type);
      var encoded = encodeGroupStorage([{ m: initialMsg, at: nowIso() }]);
      return insertNotification(pool, type, rid, uid, restaurantName, phone, encoded, linkUrl);
    }

    return upsertSingletonNotification(
      params,
      type,
      rid,
      uid,
      restaurantName,
      phone,
      detail,
      linkUrl,
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[admin_notifications]", err.message || err);
    }
    return null;
  }
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
    return {
      sql:
        "WHERE n.type IN (?, ?, ?, ?)",
      vals: ["subscription", "subscription_expiring", "subscription_expired", "payment_received"],
      filter: filter,
    };
  }
  if (filter === "registration") {
    return { sql: "WHERE n.type = ?", vals: ["new_restaurant"], filter: filter };
  }
  return { sql: "WHERE 1=1", vals: [], filter: "all" };
}

function selectColumns() {
  return (
    "n.id, n.type, n.restaurant_id, n.user_id, n.restaurant_name, n.phone, n.detail, n.link_url, n.is_read, n.created_at"
  );
}

async function queryNotifications(sqlSuffix, vals, orderLimit) {
  var pool = getPool();
  var cols = selectColumns();
  var order = orderLimit || "ORDER BY n.created_at DESC, n.id DESC";
  var fullSql = "SELECT " + cols + ", n.updated_at FROM admin_notifications n " + sqlSuffix + " " + order;
  try {
    var [rows] = await pool.query(fullSql, vals);
    return rows;
  } catch (err) {
    if (isMissingColumnError(err)) {
      var legacyOrder = order.replace(/COALESCE\(n\.updated_at,\s*n\.created_at\)/g, "n.created_at");
      fullSql = "SELECT " + cols + " FROM admin_notifications n " + sqlSuffix + " " + legacyOrder;
      var [legacyRows] = await pool.query(fullSql, vals);
      return legacyRows;
    }
    throw err;
  }
}

async function listNotifications(options) {
  options = options || {};
  var pool = getPool();
  await syncSubscriptionExpiryNotifications();
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

  var rows = await queryNotifications(
    built.sql,
    listVals,
    "ORDER BY COALESCE(n.updated_at, n.created_at) DESC, n.id DESC LIMIT ? OFFSET ?",
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
  await syncSubscriptionExpiryNotifications();
  var n = Math.min(parsePositiveInt(limit, 8), 20);
  var rows = await queryNotifications(
    "WHERE 1=1",
    [n],
    "ORDER BY n.is_read ASC, COALESCE(n.updated_at, n.created_at) DESC, n.id DESC LIMIT ?",
  );
  return rows.map(mapRow);
}

async function getNotificationById(id) {
  var nid = Number(id);
  if (!Number.isInteger(nid) || nid < 1) {
    return null;
  }
  var rows = await queryNotifications("WHERE n.id = ?", [nid], "LIMIT 1");
  return rows.length ? mapRow(rows[0]) : null;
}

async function markNotificationRead(id) {
  var pool = getPool();
  var nid = Number(id);
  if (!Number.isInteger(nid) || nid < 1) {
    return false;
  }
  var [result] = await pool.query("UPDATE admin_notifications SET is_read = 1 WHERE id = ? LIMIT 1", [
    nid,
  ]);
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

/** Synchronise les notifications d'abonnement expirant / expiré (best-effort). */
async function syncSubscriptionExpiryNotifications() {
  try {
    var pool = getPool();
    await subscriptionService.expireAllPastDueGlobally();

    var [expiringRows] = await pool.query(
      "SELECT r.id, r.name, r.whatsapp, u.phone, " +
        "DATEDIFF(DATE(r.subscription_ends_at), CURDATE()) AS days_remaining " +
        "FROM restaurants r " +
        "INNER JOIN users u ON u.id = r.user_id " +
        "WHERE r.subscription_ends_at IS NOT NULL " +
        "AND r.subscription_ends_at >= CURDATE() " +
        "AND r.subscription_ends_at < DATE_ADD(CURDATE(), INTERVAL 4 DAY) " +
        "AND r.subscription_status NOT IN ('suspended') " +
        "LIMIT 120",
    );

    for (var i = 0; i < expiringRows.length; i++) {
      var row = expiringRows[i];
      var days = Number(row.days_remaining);
      if (!Number.isFinite(days) || days < 1 || days > 3) {
        continue;
      }
      var phoneExp =
        row.whatsapp != null && String(row.whatsapp).trim() !== "" ?
          String(row.whatsapp).trim()
        : row.phone || null;
      await createAdminNotification({
        type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
        restaurantId: row.id,
        restaurantName: String(row.name || "—"),
        phone: phoneExp,
        detail:
          "Abonnement expire dans " + days + " jour" + (days > 1 ? "s" : "") + " — " + String(row.name || ""),
        linkUrl: "admin-subscriptions.html",
      });
    }

    var [expiredRows] = await pool.query(
      "SELECT r.id, r.name, r.whatsapp, u.phone " +
        "FROM restaurants r " +
        "INNER JOIN users u ON u.id = r.user_id " +
        "WHERE r.subscription_status = 'expired' " +
        "AND r.subscription_ends_at IS NOT NULL " +
        "AND r.subscription_ends_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) " +
        "LIMIT 120",
    );

    for (var j = 0; j < expiredRows.length; j++) {
      var expired = expiredRows[j];
      var phoneEx =
        expired.whatsapp != null && String(expired.whatsapp).trim() !== "" ?
          String(expired.whatsapp).trim()
        : expired.phone || null;
      await createAdminNotification({
        type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
        restaurantId: expired.id,
        restaurantName: String(expired.name || "—"),
        phone: phoneEx,
        detail: "Abonnement expiré — " + String(expired.name || "—"),
        linkUrl: "admin-subscriptions.html",
      });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[admin_notifications sync]", err.message || err);
    }
  }
}

module.exports = {
  NOTIFICATION_TYPES: NOTIFICATION_TYPES,
  CENTER_TYPES: CENTER_TYPES,
  TYPE_LABELS: TYPE_LABELS,
  labelForType: labelForType,
  linkForType: linkForType,
  createAdminNotification: createAdminNotification,
  listNotifications: listNotifications,
  getUnreadCount: getUnreadCount,
  listRecentNotifications: listRecentNotifications,
  getNotificationById: getNotificationById,
  markNotificationRead: markNotificationRead,
  markAllNotificationsRead: markAllNotificationsRead,
  deleteNotification: deleteNotification,
  syncSubscriptionExpiryNotifications: syncSubscriptionExpiryNotifications,
  isMissingTableError: isMissingTableError,
};
