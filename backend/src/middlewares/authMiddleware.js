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

  var payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré." });
  }

  var userId = Number(payload.userId);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(401).json({ message: "Token invalide." });
  }

  try {
    var pool = getPool();
    var [rows] = await pool.query("SELECT account_status FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!rows.length) {
      return res.status(401).json({ message: "Token invalide." });
    }

    var status = String(rows[0].account_status || "active").trim().toLowerCase();
    if (status === "suspended") {
      return res.status(403).json({ message: "Ce compte a été suspendu. Contactez l'administrateur." });
    }

    req.user = { id: userId };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
