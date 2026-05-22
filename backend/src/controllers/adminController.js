/**
 * Agrégats plateforme + activité récente (journal audit_logs, repli sur produits / users si table absente).
 */

const { getPool } = require("../config/database");
const { labelForCode } = require("../utils/auditLog");

function isMissingColumnError(err) {
  return err && (err.code === "ER_BAD_FIELD_ERROR" || err.errno === 1054);
}

function isMissingTableError(err) {
  return err && (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146);
}

/**
 * Revenu estimé CFA : heuristique (nombre de restaurants × forfait fictif).
 */
function estimateRevenueCfa(restaurantCount) {
  var n = Number(restaurantCount) || 0;
  return Math.round(n * 15000);
}

async function getStats(req, res) {
  try {
    var pool = getPool();

    var [[userRow]] = await pool.query("SELECT COUNT(*) AS n FROM users");
    var [[restRow]] = await pool.query("SELECT COUNT(*) AS n FROM restaurants");

    var total_users = Number(userRow.n) || 0;
    var active_restaurants = Number(restRow.n) || 0;

    var new_signups = 0;
    try {
      var [[nsRow]] = await pool.query(
        "SELECT COUNT(*) AS n FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
      );
      new_signups = Number(nsRow.n) || 0;
    } catch (err) {
      if (!isMissingColumnError(err)) {
        throw err;
      }
    }

    var active_subscriptions = 0;
    var estimated_revenue_cfa = estimateRevenueCfa(active_restaurants);

    return res.json({
      total_users: total_users,
      active_restaurants: active_restaurants,
      new_signups: new_signups,
      active_subscriptions: active_subscriptions,
      estimated_revenue_cfa: estimated_revenue_cfa,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les statistiques." });
  }
}

/**
 * Activité historique (sans audit_logs) pour repli.
 */
async function buildLegacyActivityItems(pool) {
  var items = [];

  try {
    var [products] = await pool.query(
      "SELECT p.name AS product_name, u.email AS user_email, p.created_at AS at " +
        "FROM products p " +
        "INNER JOIN restaurants r ON r.id = p.restaurant_id " +
        "INNER JOIN users u ON u.id = r.user_id " +
        "ORDER BY p.created_at DESC, p.id DESC " +
        "LIMIT 12"
    );
    for (var i = 0; i < products.length; i += 1) {
      var row = products[i];
      items.push({
        user: row.user_email || "—",
        action: 'Ajout produit « ' + String(row.product_name || "").slice(0, 80) + ' »',
        at: row.at ? new Date(row.at).toISOString() : null,
      });
    }
  } catch (err) {
    if (!isMissingColumnError(err)) {
      throw err;
    }
    var [fallbackProducts] = await pool.query(
      "SELECT p.name AS product_name, u.email AS user_email " +
        "FROM products p " +
        "INNER JOIN restaurants r ON r.id = p.restaurant_id " +
        "INNER JOIN users u ON u.id = r.user_id " +
        "ORDER BY p.id DESC " +
        "LIMIT 12"
    );
    for (var j = 0; j < fallbackProducts.length; j += 1) {
      var fr = fallbackProducts[j];
      items.push({
        user: fr.user_email || "—",
        action: 'Ajout produit « ' + String(fr.product_name || "").slice(0, 80) + ' »',
        at: null,
      });
    }
  }

  try {
    var [signups] = await pool.query(
      "SELECT email AS user_email, created_at AS at FROM users ORDER BY created_at DESC, id DESC LIMIT 8"
    );
    for (var k = 0; k < signups.length; k += 1) {
      var su = signups[k];
      items.push({
        user: su.user_email || "—",
        action: "Inscription utilisateur",
        at: su.at ? new Date(su.at).toISOString() : null,
      });
    }
  } catch (err2) {
    if (!isMissingColumnError(err2)) {
      throw err2;
    }
  }

  items.sort(function (a, b) {
    if (!a.at && !b.at) {
      return 0;
    }
    if (!a.at) {
      return 1;
    }
    if (!b.at) {
      return -1;
    }
    return new Date(b.at) - new Date(a.at);
  });

  return items.slice(0, 20);
}

async function getActivity(req, res) {
  try {
    var pool = getPool();

    try {
      var [auditRows] = await pool.query(
        "SELECT a.created_at AS at, a.action AS code, a.detail, u.email AS user_email " +
          "FROM audit_logs a " +
          "LEFT JOIN users u ON u.id = a.user_id " +
          "ORDER BY a.created_at DESC, a.id DESC " +
          "LIMIT 40"
      );

      var fromAudit = auditRows.map(function (r) {
        var detail = String(r.detail || "").trim();
        var actionText = detail.length ? detail.slice(0, 500) : labelForCode(r.code);
        return {
          user: r.user_email || "—",
          action: actionText,
          at: r.at ? new Date(r.at).toISOString() : null,
        };
      });

      return res.json({
        items: fromAudit,
      });
    } catch (err) {
      if (!isMissingTableError(err)) {
        throw err;
      }
    }

    var legacy = await buildLegacyActivityItems(pool);
    return res.json({
      items: legacy,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger l’activité." });
  }
}

module.exports = {
  getStats: getStats,
  getActivity: getActivity,
};
