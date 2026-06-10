/**
 * Middleware JWT — routes protégées
 * Attendu : header "Authorization: Bearer <token>"
 * Remplit req.user = { id } (id utilisateur issu du payload JWT)
 */

const jwt = require("jsonwebtoken");
const { getPool } = require("../config/database");

async function requireAuth(req, res, next) {
  var header = req.headers.authorization || "";
  var parts = header.split(" ");
  var scheme = parts[0];
  var token = parts[1];

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentification requise (token manquant)." });
  }

  var secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ message: "Configuration serveur : JWT_SECRET manquant." });
  }

  try {
    var payload = jwt.verify(token, secret);
    var userId = payload.userId;
    if (!userId) {
      return res.status(401).json({ message: "Token invalide." });
    }
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré." });
  }

  try {
    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id, account_status FROM users WHERE id = ? LIMIT 1",
      [userId],
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Token invalide." });
    }

    var accountStatus =
      rows[0].account_status != null && String(rows[0].account_status).trim() !== "" ?
        String(rows[0].account_status).trim().toLowerCase()
      : "active";

    if (accountStatus === "suspended") {
      return res.status(403).json({ message: "Ce compte a été suspendu. Contactez l'administrateur." });
    }

    req.user = { id: rows[0].id };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireAuth;
