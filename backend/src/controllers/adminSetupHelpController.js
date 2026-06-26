/**
 * Restaurants ayant demandé une assistance installation (needs_setup_help).
 */

var { getPool } = require("../config/database");
var { appendAudit, AUDIT_ACTIONS, ACTOR_TYPES } = require("../utils/auditLog");

function parsePositiveInt(value, fallback) {
  var n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return fallback;
  }
  return n;
}

async function listSetupHelp(req, res) {
  try {
    var pool = getPool();
    var page = parsePositiveInt(req.query.page, 1);
    var pageSize = Math.min(parsePositiveInt(req.query.pageSize, 50), 200);
    var offset = (page - 1) * pageSize;

    var [[countRow]] = await pool.query(
      "SELECT COUNT(*) AS n FROM restaurants r WHERE COALESCE(r.needs_setup_help, 0) = 1",
    );
    var total = Number(countRow.n) || 0;
    var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    var [rows] = await pool.query(
      "SELECT r.id, r.name, r.whatsapp, r.created_at, u.email AS owner_email " +
        "FROM restaurants r " +
        "INNER JOIN users u ON u.id = r.user_id " +
        "WHERE COALESCE(r.needs_setup_help, 0) = 1 " +
        "ORDER BY r.created_at DESC " +
        "LIMIT ? OFFSET ?",
      [pageSize, offset],
    );

    var items = rows.map(function (r) {
      return {
        id: r.id,
        name: String(r.name || "").trim() || "—",
        email: r.owner_email ? String(r.owner_email) : "",
        phone: r.whatsapp != null ? String(r.whatsapp) : "",
        created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      };
    });

    return res.json({
      items: items,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les demandes d’assistance." });
  }
}

async function postSetupHelpComplete(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id, name, needs_setup_help FROM restaurants WHERE id = ? LIMIT 1",
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    if (!rows[0].needs_setup_help) {
      return res.json({
        ok: true,
        message: "Ce restaurant ne figure pas dans les demandes en cours.",
        needs_setup_help: false,
      });
    }

    await pool.query(
      "UPDATE restaurants SET needs_setup_help = 0 WHERE id = ? LIMIT 1",
      [id],
    );

    await appendAudit({
      userId: req.user.id,
      restaurantId: id,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.SETUP_HELP_COMPLETE,
      detail: "Installation terminée (« " + String(rows[0].name || "") + " »)",
    });

    return res.json({ ok: true, message: "Demande marquée comme traitée.", needs_setup_help: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  listSetupHelp: listSetupHelp,
  postSetupHelpComplete: postSetupHelpComplete,
};
