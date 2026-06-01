/**
 * Accès routes /api/admin/* — liste d’emails dans ADMIN_EMAILS (env).
 * ADMIN_EMAILS doit être configuré explicitement pour activer l'administration.
 */

const { getPool } = require("../config/database");

async function requirePlatformAdmin(req, res, next) {
  try {
    var pool = getPool();
    var [rows] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [req.user.id]);

    if (!rows.length) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    var email = String(rows[0].email || "")
      .trim()
      .toLowerCase();
    var raw = process.env.ADMIN_EMAILS || "";
    var allow = raw
      .split(",")
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean);

    if (allow.length === 0) {
      return res.status(403).json({ message: "Accès administration non configuré." });
    }

    if (allow.indexOf(email) === -1) {
      return res.status(403).json({ message: "Accès administration réservé." });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requirePlatformAdmin;
