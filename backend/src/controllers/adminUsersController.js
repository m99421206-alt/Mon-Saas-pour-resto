/**
 * Liste et gestion des utilisateurs — réservé admin plateforme.
 */

const bcrypt = require("bcryptjs");
const { getPool } = require("../config/database");
const { appendAudit, AUDIT_ACTIONS, ACTOR_TYPES } = require("../utils/auditLog");

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
        "(u.email LIKE ? OR IFNULL(TRIM(u.phone),'') LIKE ? OR EXISTS (SELECT 1 FROM restaurants r WHERE r.user_id = u.id AND (r.name LIKE ? OR IFNULL(r.city, '') LIKE ?)))",
      );
      vals.push(like, like, like, like);
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
        "  u.phone AS phone, " +
        "  CASE WHEN LOWER(TRIM(COALESCE(u.account_status, 'active'))) = 'suspended' THEN 'suspended' ELSE 'active' END AS status, " +
        "  u.created_at AS created_at, " +
        "  COALESCE((SELECT r.name FROM restaurants r WHERE r.user_id = u.id ORDER BY r.id ASC LIMIT 1), SUBSTRING_INDEX(u.email, ?, 1)) AS nom, " +
        "  (SELECT NULLIF(TRIM(r.city), '') FROM restaurants r WHERE r.user_id = u.id ORDER BY r.id ASC LIMIT 1) AS quartier " +
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
        phone: r.phone != null && String(r.phone).trim() !== "" ? String(r.phone).trim() : null,
        quartier: r.quartier != null && String(r.quartier).trim() !== "" ? String(r.quartier).trim() : null,
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
      "SELECT id, email, phone, CASE WHEN LOWER(TRIM(COALESCE(account_status, 'active'))) = 'suspended' THEN 'suspended' ELSE 'active' END AS status, created_at FROM users WHERE id = ? LIMIT 1",
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
      "SELECT id, name, city, whatsapp FROM restaurants WHERE user_id = ? ORDER BY id ASC",
      [id],
    );

    var quartierVal = null;
    for (var ri = 0; ri < restaurants.length; ri += 1) {
      var c = restaurants[ri].city;
      if (c != null && String(c).trim() !== "") {
        quartierVal = String(c).trim();
        break;
      }
    }

    return res.json({
      user: {
        id: u.id,
        email: u.email,
        phone: u.phone != null && String(u.phone).trim() !== "" ? String(u.phone).trim() : null,
        quartier: quartierVal,
        status: st,
        created_at: u.created_at ? new Date(u.created_at).toISOString() : null,
      },
      restaurants: restaurants.map(function (r) {
        return {
          id: r.id,
          name: r.name,
          whatsapp: r.whatsapp,
          city: r.city,
          quartier: r.city != null && String(r.city).trim() !== "" ? String(r.city).trim() : null,
        };
      }),
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
      actorType: ACTOR_TYPES.ADMIN,
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

async function patchUserPassword(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var password = String(req.body.password || "");
    var confirmPassword = String(
      req.body.confirmPassword != null ? req.body.confirmPassword : req.body.passwordConfirm || "",
    );

    if (!password) {
      return res.status(400).json({ message: "Le nouveau mot de passe est obligatoire." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Les mots de passe ne correspondent pas." });
    }

    var adminId = Number(req.user.id);
    var pool = getPool();
    var [[target]] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    var rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
    var passwordHash = await bcrypt.hash(password, rounds);

    var [result] = await pool.query("UPDATE users SET password = ? WHERE id = ? LIMIT 1", [passwordHash, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    await appendAudit({
      userId: adminId,
      restaurantId: null,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      detail: "Réinitialisation mot de passe du compte « " + String(target.email) + " »",
    });

    return res.json({
      ok: true,
      id: id,
      message: "Mot de passe mis à jour avec succès.",
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
      actorType: ACTOR_TYPES.ADMIN,
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
  patchUserPassword: patchUserPassword,
  deleteUser: deleteUser,
};
