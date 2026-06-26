/**
 * Requêtes et classification du journal audit_logs (liste, filtres, badges).
 */

const { labelForCode } = require("./auditLog");

function isMissingColumnError(err) {
  return err && (err.code === "ER_BAD_FIELD_ERROR" || err.errno === 1054);
}

var LEGACY_SELECT_FIELDS =
  "SELECT a.id, a.created_at AS at, a.action AS code, a.detail, a.restaurant_id, " +
  "u.email AS user_email, r.name AS restaurant_name ";

var VALID_FILTERS = [
  "all",
  "logins",
  "login_failures",
  "products",
  "categories",
  "menus",
  "password_resets",
  "admin",
];

var BASE_FROM =
  "FROM audit_logs a " +
  "LEFT JOIN users u ON u.id = a.user_id " +
  "LEFT JOIN restaurants r ON r.id = a.restaurant_id " +
  "LEFT JOIN users su ON su.id = a.subject_user_id ";

function isImpersonationRow(row) {
  return row && (row.impersonation === 1 || row.impersonation === true);
}

function actorLabelForRow(row) {
  var code = String(row.code || row.action || "").trim();
  var email = row.user_email ? String(row.user_email) : "";
  var actorType = row.actor_type ? String(row.actor_type).toLowerCase() : "";

  if (isImpersonationRow(row)) {
    return "Administrateur";
  }
  if (actorType === "admin") {
    return "Administrateur";
  }
  if (actorType === "restaurant") {
    return "Restaurant";
  }

  if (
    row.restaurant_id &&
    (code.indexOf("product.") === 0 ||
      code.indexOf("category.") === 0 ||
      code.indexOf("media.") === 0 ||
      code === "restaurant.settings_update" ||
      code === "onboarding.setup_request")
  ) {
    return "Restaurant";
  }

  if (
    code.indexOf("admin.") === 0 ||
    code.indexOf("subscription.") === 0 ||
    code === "settings.update" ||
    code === "user.suspend" ||
    code === "user.activate" ||
    code === "user.delete" ||
    code === "user.password_reset" ||
    code === "admin.setup_help_complete"
  ) {
    return "Administrateur";
  }

  return email || "—";
}

function modeLabelForRow(row) {
  return isImpersonationRow(row) ? "Impersonation" : "Normal";
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

function badgeVariantForCode(code) {
  var c = String(code || "").toLowerCase();
  if (c === "user.login") {
    return "success";
  }
  if (c === "user.login_failed") {
    return "danger";
  }
  if (c === "user.password_reset") {
    return "password";
  }
  if (
    c.endsWith(".delete") ||
    c === "user.suspend" ||
    c === "restaurant.menu_suspend" ||
    c === "subscription.suspend"
  ) {
    return "delete";
  }
  if (
    c.endsWith(".create") ||
    c === "user.register" ||
    c === "subscription.activate" ||
    c === "subscription.renew"
  ) {
    return "create";
  }
  if (
    c.endsWith(".update") ||
    c.endsWith(".adjust") ||
    c === "user.activate" ||
    c === "restaurant.menu_resume" ||
    c === "settings.update" ||
    c.indexOf("admin.") === 0 ||
    c.indexOf("subscription.") === 0
  ) {
    return "update";
  }
  return "neutral";
}

function buildWhereClause(filterKey, searchRaw) {
  var parts = ["WHERE 1=1"];
  var vals = [];

  var filter = normalizeFilter(filterKey);
  if (filter === "logins") {
    parts.push("AND a.action = ?");
    vals.push("user.login");
  } else if (filter === "login_failures") {
    parts.push("AND a.action = ?");
    vals.push("user.login_failed");
  } else if (filter === "products") {
    parts.push("AND a.action IN (?, ?, ?)");
    vals.push("product.create", "product.update", "product.delete");
  } else if (filter === "categories") {
    parts.push("AND a.action IN (?, ?, ?)");
    vals.push("category.create", "category.update", "category.delete");
  } else if (filter === "menus") {
    parts.push("AND a.action IN (?, ?)");
    vals.push("restaurant.menu_suspend", "restaurant.menu_resume");
  } else if (filter === "password_resets") {
    parts.push("AND a.action = ?");
    vals.push("user.password_reset");
  } else if (filter === "admin") {
    parts.push(
      "AND (a.action IN (?, ?, ?, ?, ?, ?, ?, ?) OR a.action LIKE 'subscription.%' OR a.action LIKE 'admin.%')",
    );
    vals.push(
      "user.suspend",
      "user.activate",
      "user.delete",
      "settings.update",
      "restaurant.delete",
      "onboarding.setup_request",
      "admin.setup_help_complete",
      "admin.restaurant_dashboard_access",
    );
  }

  var q = typeof searchRaw === "string" ? searchRaw.trim().slice(0, 160) : "";
  if (q) {
    var like = "%" + q + "%";
    parts.push("AND (u.email LIKE ? OR r.name LIKE ? OR a.action LIKE ? OR IFNULL(a.detail, '') LIKE ?)");
    vals.push(like, like, like, like);
  }

  return {
    whereSql: parts.join(" "),
    vals: vals,
    filter: filter,
  };
}

function mapAuditRow(row) {
  var code = String(row.code || row.action || "").trim();
  var detail = String(row.detail || "").trim();
  var actionText = detail.length ? detail.slice(0, 500) : labelForCode(code);
  var actor = actorLabelForRow(row);
  var mode = modeLabelForRow(row);
  return {
    id: row.id,
    at: row.at ? new Date(row.at).toISOString() : null,
    user: actor,
    actor: actor,
    mode: mode,
    impersonation: isImpersonationRow(row),
    actor_type: row.actor_type ? String(row.actor_type) : null,
    subject_user:
      row.subject_user_email ? String(row.subject_user_email)
      : row.subject_user_id ? "Utilisateur #" + row.subject_user_id
      : null,
    restaurant: row.restaurant_name ? String(row.restaurant_name) : "—",
    action_code: code,
    action_label: labelForCode(code),
    action: actionText,
    detail: detail || null,
    badge: badgeVariantForCode(code),
  };
}

var AUDIT_SELECT_FIELDS =
  "SELECT a.id, a.created_at AS at, a.action AS code, a.detail, a.impersonation, a.actor_type, a.subject_user_id, a.restaurant_id, " +
  "u.email AS user_email, su.email AS subject_user_email, r.name AS restaurant_name ";

async function queryAuditRows(pool, built, limit, offset) {
  var listVals = built.vals.slice();
  listVals.push(limit);
  if (offset != null) {
    listVals.push(offset);
  }

  var pagingSql = " ORDER BY a.created_at DESC, a.id DESC LIMIT ?";
  if (offset != null) {
    pagingSql += " OFFSET ?";
  }

  try {
    var [rows] = await pool.query(AUDIT_SELECT_FIELDS + BASE_FROM + built.whereSql + pagingSql, listVals);
    return rows;
  } catch (err) {
    if (!isMissingColumnError(err)) {
      throw err;
    }
    var legacyFrom =
      "FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN restaurants r ON r.id = a.restaurant_id ";
    var [legacyRows] = await pool.query(
      LEGACY_SELECT_FIELDS + legacyFrom + built.whereSql + pagingSql,
      listVals
    );
    return legacyRows;
  }
}

async function listAuditLogs(pool, options) {
  options = options || {};
  var page = parsePositiveInt(options.page, 1);
  var pageSize = Math.min(parsePositiveInt(options.pageSize, 20), 100);
  var offset = (page - 1) * pageSize;
  var built = buildWhereClause(options.filter, options.q);

  var [[countRow]] = await pool.query(
    "SELECT COUNT(*) AS n " + BASE_FROM + built.whereSql,
    built.vals.slice(),
  );
  var total = Number(countRow.n) || 0;
  var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  var rows = await queryAuditRows(pool, built, pageSize, offset);

  return {
    items: rows.map(mapAuditRow),
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages,
    filter: built.filter,
  };
}

async function fetchAuditStats(pool) {
  var [[totalRow]] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs");
  var [[loginsTodayRow]] = await pool.query(
    "SELECT COUNT(*) AS n FROM audit_logs WHERE action = ? AND DATE(created_at) = CURDATE()",
    ["user.login"],
  );
  var [[failuresTodayRow]] = await pool.query(
    "SELECT COUNT(*) AS n FROM audit_logs WHERE action = ? AND DATE(created_at) = CURDATE()",
    ["user.login_failed"],
  );
  var [[pwdRow]] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = ?", [
    "user.password_reset",
  ]);

  return {
    total_logs: Number(totalRow.n) || 0,
    logins_today: Number(loginsTodayRow.n) || 0,
    login_failures_today: Number(failuresTodayRow.n) || 0,
    password_resets: Number(pwdRow.n) || 0,
  };
}

async function exportAuditLogs(pool, options) {
  options = options || {};
  var built = buildWhereClause(options.filter, options.q);
  var maxRows = Math.min(parsePositiveInt(options.maxRows, 10000), 50000);
  var rows = await queryAuditRows(pool, built, maxRows, null);

  return rows.map(mapAuditRow);
}

async function purgeOldAuditLogs(pool, retentionDays) {
  var days = Math.min(Math.max(parsePositiveInt(retentionDays, 90), 1), 365);
  var [result] = await pool.query(
    "DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
    [days],
  );
  return {
    deleted: Number(result.affectedRows) || 0,
    retention_days: days,
  };
}

module.exports = {
  VALID_FILTERS: VALID_FILTERS,
  badgeVariantForCode: badgeVariantForCode,
  normalizeFilter: normalizeFilter,
  actorLabelForRow: actorLabelForRow,
  modeLabelForRow: modeLabelForRow,
  listAuditLogs: listAuditLogs,
  fetchAuditStats: fetchAuditStats,
  exportAuditLogs: exportAuditLogs,
  purgeOldAuditLogs: purgeOldAuditLogs,
  mapAuditRow: mapAuditRow,
};
