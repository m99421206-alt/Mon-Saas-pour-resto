/**
 * Accès routes /api/admin/* — email présent dans ADMIN_EMAILS (env).
 * Aucun contournement : si la liste est vide ou l'email absent, accès refusé (403).
 */

const { getPool } = require("../config/database");
const {
  parseAdminEmailAllowlist,
  isPlatformAdminEmail,
  logAdminAccessDenied,
} = require("../utils/platformAdmin");

async function requirePlatformAdmin(req, res, next) {
  try {
    var pool = getPool();
    var [rows] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [req.user.id]);

    if (!rows.length) {
      logAdminAccessDenied(req, null, "user_not_found");
      return res.status(403).json({ message: "Accès refusé." });
    }

    var email = String(rows[0].email || "")
      .trim()
      .toLowerCase();
    var allow = parseAdminEmailAllowlist();

    if (allow.length === 0) {
      logAdminAccessDenied(req, email, "admin_emails_not_configured");
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({
          message: "Administration indisponible : ADMIN_EMAILS non configuré.",
        });
      }
      return res.status(403).json({
        message: "Accès administration réservé. Configurez ADMIN_EMAILS dans backend/.env.",
      });
    }

    if (!isPlatformAdminEmail(email)) {
      logAdminAccessDenied(req, email, "email_not_in_allowlist");
      return res.status(403).json({ message: "Accès administration réservé." });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requirePlatformAdmin;
