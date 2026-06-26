/**
 * Journal d’activité plateforme — liste, export CSV, purge.
 */

const { getPool } = require("../config/database");
const { appendAudit, AUDIT_ACTIONS, ACTOR_TYPES } = require("../utils/auditLog");
const {
  listAuditLogs,
  fetchAuditStats,
  exportAuditLogs,
  purgeOldAuditLogs,
} = require("../utils/auditLogQuery");

function isMissingTableError(err) {
  return err && (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146);
}

function csvEscape(value) {
  var s = String(value == null ? "" : value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatCsvDate(iso) {
  if (!iso) {
    return "";
  }
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch (e) {
    return String(iso);
  }
}

async function getAuditLogs(req, res) {
  try {
    var pool = getPool();
    var result = await listAuditLogs(pool, {
      page: req.query.page,
      pageSize: req.query.pageSize,
      filter: req.query.filter,
      q: req.query.q,
    });
    var stats = await fetchAuditStats(pool);

    return res.json({
      logs: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      filter: result.filter,
      stats: stats,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({
        logs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        filter: "all",
        stats: {
          total_logs: 0,
          logins_today: 0,
          login_failures_today: 0,
          password_resets: 0,
        },
      });
    }
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger le journal d’activité." });
  }
}

async function exportAuditLogsCsv(req, res) {
  try {
    var pool = getPool();
    var rows = await exportAuditLogs(pool, {
      filter: req.query.filter,
      q: req.query.q,
    });

    var lines = [
      ["Date et heure", "Effectué par", "Restaurant", "Mode", "Type d'action", "Détails", "Code"]
        .map(csvEscape)
        .join(","),
    ];

    rows.forEach(function (row) {
      lines.push(
        [
          formatCsvDate(row.at),
          row.actor || row.user,
          row.restaurant,
          row.mode || "Normal",
          row.action_label,
          row.action,
          row.action_code,
        ]
          .map(csvEscape)
          .join(","),
      );
    });

    var csv = "\uFEFF" + lines.join("\r\n");
    var stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="menugo-journal-' + stamp + '.csv"');
    return res.send(csv);
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.status(404).json({ message: "Journal d’activité indisponible." });
    }
    console.error(err);
    return res.status(500).json({ message: "Export impossible." });
  }
}

async function purgeAuditLogs(req, res) {
  try {
    var pool = getPool();
    var result = await purgeOldAuditLogs(pool, 90);
    var adminId = Number(req.user.id);

    await appendAudit({
      userId: adminId,
      restaurantId: null,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      detail:
        "Purge journal d’activité : " +
        result.deleted +
        " entrée(s) supprimée(s) (> " +
        result.retention_days +
        " jours)",
    });

    return res.json({
      ok: true,
      deleted: result.deleted,
      retention_days: result.retention_days,
      message:
        result.deleted > 0 ?
          result.deleted + " entrée(s) supprimée(s). Conservation : " + result.retention_days + " jours."
        : "Aucune entrée à supprimer (conservation : " + result.retention_days + " jours).",
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.status(404).json({ message: "Journal d’activité indisponible." });
    }
    console.error(err);
    return res.status(500).json({ message: "Purge impossible." });
  }
}

module.exports = {
  getAuditLogs: getAuditLogs,
  exportAuditLogsCsv: exportAuditLogsCsv,
  purgeAuditLogs: purgeAuditLogs,
};
