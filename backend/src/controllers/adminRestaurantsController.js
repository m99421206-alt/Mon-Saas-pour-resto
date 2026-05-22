/**
 * Liste et gestion des restaurants — admin plateforme.
 */

var { getPool } = require("../config/database");
var { appendAudit, AUDIT_ACTIONS } = require("../utils/auditLog");

var ALLOWED_SUB = ["trial", "active", "expired", "suspended"];

function parsePositiveInt(value, fallback) {
  var n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return fallback;
  }
  return n;
}

function normalizeSub(raw) {
  var s = String(raw || "").trim().toLowerCase();
  return ALLOWED_SUB.indexOf(s) !== -1 ? s : "trial";
}

function mapRow(r) {
  var ms = r.menu_suspended;
  var menuSuspended = ms === 1 || ms === true || ms === "1";
  return {
    id: r.id,
    name: String(r.name || "").trim() || "—",
    logo_url: r.logo_url ? String(r.logo_url) : null,
    city: r.city != null && String(r.city).trim() !== "" ? String(r.city).trim() : null,
    phone: r.whatsapp != null ? String(r.whatsapp) : null,
    subscription_status: normalizeSub(r.subscription_status),
    menu_suspended: menuSuspended,
    product_count: Number(r.product_count) || 0,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    owner_email: r.owner_email ? String(r.owner_email) : "",
  };
}

async function listRestaurants(req, res) {
  try {
    var pool = getPool();
    var page = parsePositiveInt(req.query.page, 1);
    var pageSize = Math.min(parsePositiveInt(req.query.pageSize, 12), 100);
    var offset = (page - 1) * pageSize;

    var qRaw = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 160) : "";
    var statusFilter =
      typeof req.query.subscription === "string" ? req.query.subscription.trim().toLowerCase() : "all";
    var menuFilter = typeof req.query.menu === "string" ? req.query.menu.trim().toLowerCase() : "all";

    var conditions = [];
    var vals = [];

    if (qRaw) {
      var like = "%" + qRaw + "%";
      conditions.push(
        "(r.name LIKE ? OR u.email LIKE ? OR IFNULL(r.whatsapp, '') LIKE ? OR IFNULL(r.city, '') LIKE ?)",
      );
      vals.push(like, like, like, like);
    }

    if (statusFilter !== "all" && ALLOWED_SUB.indexOf(statusFilter) !== -1) {
      conditions.push(
        "LOWER(TRIM(COALESCE(NULLIF(TRIM(r.subscription_status),''), 'trial'))) = ?",
      );
      vals.push(statusFilter);
    }

    if (menuFilter === "live") {
      conditions.push("COALESCE(r.menu_suspended, 0) = 0");
    } else if (menuFilter === "suspended_menu") {
      conditions.push("(COALESCE(r.menu_suspended, 0) = 1)");
    }

    var whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    var [[countRow]] = await pool.query(
      "SELECT COUNT(*) AS n FROM restaurants r INNER JOIN users u ON u.id = r.user_id " + whereClause,
      vals,
    );

    var total = Number(countRow.n) || 0;
    var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    var listVals = vals.slice();
    listVals.push(pageSize, offset);

    var [rows] = await pool.query(
      "SELECT r.id, r.name, r.city, r.whatsapp AS whatsapp, r.logo_url, r.subscription_status, r.menu_suspended, " +
        "r.created_at AS created_at, u.email AS owner_email, " +
        "(SELECT COUNT(*) FROM products p WHERE p.restaurant_id = r.id) AS product_count " +
        "FROM restaurants r " +
        "INNER JOIN users u ON u.id = r.user_id " +
        whereClause +
        " ORDER BY r.id DESC LIMIT ? OFFSET ?",
      listVals,
    );

    var items = rows.map(mapRow);

    return res.json({
      restaurants: items,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les restaurants." });
  }
}

async function getRestaurantDetail(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT r.id, r.user_id, r.name, r.city, r.description, r.whatsapp, r.logo_url, r.banner_url, r.theme_color, " +
        "r.subscription_status, r.menu_suspended, r.created_at AS created_at, u.email AS owner_email, " +
        "(SELECT COUNT(*) FROM products p WHERE p.restaurant_id = r.id) AS product_count, " +
        "(SELECT COUNT(*) FROM categories c WHERE c.restaurant_id = r.id) AS category_count " +
        "FROM restaurants r INNER JOIN users u ON u.id = r.user_id WHERE r.id = ? LIMIT 1",
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    var raw = rows[0];
    return res.json({
      restaurant: Object.assign({}, mapRow(raw), {
        user_id: raw.user_id,
        description: raw.description,
        banner_url: raw.banner_url,
        theme_color: raw.theme_color,
        category_count: Number(raw.category_count) || 0,
      }),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function patchMenuSuspended(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var suspendedRaw = req.body.suspended != null ? req.body.suspended : req.body.menu_suspended;
    var suspended = suspendedRaw === true || suspendedRaw === 1 || suspendedRaw === "1" || suspendedRaw === "true";

    var pool = getPool();
    var adminId = Number(req.user.id);

    var [[target]] = await pool.query("SELECT id, name FROM restaurants WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    var flag = suspended ? 1 : 0;
    var [result] = await pool.query("UPDATE restaurants SET menu_suspended = ? WHERE id = ? LIMIT 1", [flag, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    await appendAudit({
      userId: adminId,
      restaurantId: id,
      action: suspended ? AUDIT_ACTIONS.RESTAURANT_MENU_SUSPEND : AUDIT_ACTIONS.RESTAURANT_MENU_RESUME,
      detail: suspended
        ? 'Menu public suspendu — « ' + String(target.name || id) + ' »'
        : 'Menu public réactivé — « ' + String(target.name || id) + ' »',
    });

    return res.json({
      ok: true,
      id: id,
      menu_suspended: suspended,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function deleteRestaurant(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var pool = getPool();
    var adminId = Number(req.user.id);

    var [[target]] = await pool.query("SELECT id, name FROM restaurants WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    await appendAudit({
      userId: adminId,
      restaurantId: id,
      action: AUDIT_ACTIONS.RESTAURANT_DELETE,
      detail: "Suppression du restaurant « " + String(target.name || id) + " »",
    });

    await pool.query("DELETE FROM restaurants WHERE id = ? LIMIT 1", [id]);

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur lors de la suppression." });
  }
}

module.exports = {
  listRestaurants: listRestaurants,
  getRestaurantDetail: getRestaurantDetail,
  patchMenuSuspended: patchMenuSuspended,
  deleteRestaurant: deleteRestaurant,
};
