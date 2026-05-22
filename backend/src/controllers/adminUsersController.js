/**
 * Liste et gestion des utilisateurs — réservé admin plateforme.
 */

const { getPool } = require("../config/database");
const { appendAudit, AUDIT_ACTIONS } = require("../utils/auditLog");

var ALLOWED_STATUS = ["active", "suspended"];

function parsePositiveInt(value, fallback) {
  var n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return fallback;
  }
  return n;
}

async function listUsers(req, res) {
  try {
    var pool = getPool();
    var page = parsePositiveInt(req.query.page, 1);
    var pageSize = Math.min(parsePositiveInt(req.query.pageSize, 12), 100);
    var offset = (page - 1) * pageSize;

    var qRaw = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 160) : "";
    var statusFilter = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "all";

    var conditions = [];
    var vals = [];

    if (qRaw) {
      var like = "%" + qRaw + "%";
      conditions.push(
        "(u.email LIKE ? OR EXISTS (SELECT 1 FROM restaurants r WHERE r.user_id = u.id AND r.name LIKE ?))",
      );
      vals.push(like, like);
    }

    if (statusFilter === "active") {
      conditions.push("LOWER(TRIM(COALESCE(u.account_status, 'active'))) <> 'suspended'");
    } else if (statusFilter === "suspended") {
      conditions.push("LOWER(TRIM(COALESCE(u.account_status, 'active'))) = 'suspended'");
    }

    var whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    var [[countRow]] = await pool.query(
      "SELECT COUNT(*) AS n FROM users u " + whereClause,
      vals,
    );

    var total = Number(countRow.n) || 0;
    var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    var listVals = vals.slice();
    listVals.unshift("@");
    listVals.push(pageSize, offset);

    var [rows] = await pool.query(
      "SELECT " +
        "  u.id, " +
        "  u.email, " +
        "  CASE WHEN LOWER(TRIM(COALESCE(u.account_status, 'active'))) = 'suspended' THEN 'suspended' ELSE 'active' END AS status, " +
        "  u.created_at AS created_at, " +
        "  COALESCE((SELECT r.name FROM restaurants r WHERE r.user_id = u.id ORDER BY r.id ASC LIMIT 1), SUBSTRING_INDEX(u.email, ?, 1)) AS nom " +
        "FROM users u " +
        whereClause +
        " ORDER BY u.id DESC LIMIT ? OFFSET ?",
      listVals,
    );

    var users = rows.map(function (r) {
      var st = String(r.status || "active").toLowerCase().trim();
      if (st !== "suspended") {
        st = "active";
      }
      return {
        id: r.id,
        nom: String(r.nom || "").trim() || "—",
        email: String(r.email || ""),
        status: st,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      };
    });

    return res.json({
      users: users,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les utilisateurs." });
  }
}

async function getUserDetail(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var pool = getPool();
    var [users] = await pool.query(
      "SELECT id, email, CASE WHEN LOWER(TRIM(COALESCE(account_status, 'active'))) = 'suspended' THEN 'suspended' ELSE 'active' END AS status, created_at FROM users WHERE id = ? LIMIT 1",
      [id],
    );

    if (!users.length) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    var u = users[0];
    var st = String(u.status || "active").toLowerCase().trim();
    if (st !== "suspended") {
      st = "active";
    }

    var [restaurants] = await pool.query(
      "SELECT id, name, whatsapp FROM restaurants WHERE user_id = ? ORDER BY id ASC",
      [id],
    );

    return res.json({
      user: {
        id: u.id,
        email: u.email,
        status: st,
        created_at: u.created_at ? new Date(u.created_at).toISOString() : null,
      },
      restaurants: restaurants,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function patchUserStatus(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var nextStatus = typeof req.body.status === "string" ? req.body.status.trim().toLowerCase() : "";
    if (ALLOWED_STATUS.indexOf(nextStatus) === -1) {
      return res.status(400).json({ message: "Statut invalide (active ou suspended)." });
    }

    var adminId = Number(req.user.id);
    if (id === adminId) {
      return res.status(400).json({ message: "Vous ne pouvez pas modifier votre propre compte ainsi." });
    }

    var pool = getPool();
    var [[target]] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    var [result] = await pool.query("UPDATE users SET account_status = ? WHERE id = ? LIMIT 1", [nextStatus, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    var email = target.email || String(id);

    await appendAudit({
      userId: adminId,
      restaurantId: null,
      action: nextStatus === "suspended" ? AUDIT_ACTIONS.USER_SUSPEND : AUDIT_ACTIONS.USER_ACTIVATE,
      detail:
        nextStatus === "suspended"
          ? 'Suspension du compte « ' + email + ' »'
          : 'Réactivation du compte « ' + email + ' »',
    });

    return res.json({
      ok: true,
      id: id,
      status: nextStatus,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function deleteUser(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var adminId = Number(req.user.id);
    if (id === adminId) {
      return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte." });
    }

    var pool = getPool();
    var [[target]] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    await appendAudit({
      userId: adminId,
      restaurantId: null,
      action: AUDIT_ACTIONS.USER_DELETE,
      detail: "Suppression du compte « " + String(target.email) + " »",
    });

    await pool.query("DELETE FROM users WHERE id = ? LIMIT 1", [id]);

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur lors de la suppression." });
  }
}

module.exports = {
  listUsers: listUsers,
  getUserDetail: getUserDetail,
  patchUserStatus: patchUserStatus,
  deleteUser: deleteUser,
};
