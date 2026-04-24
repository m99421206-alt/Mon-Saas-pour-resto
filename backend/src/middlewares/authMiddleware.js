/**
 * Middleware JWT — routes protégées
 * Attendu : header "Authorization: Bearer <token>"
 * Remplit req.user = { id } (id utilisateur issu du payload JWT)
 */

const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
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
    req.user = { id: userId };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré." });
  }
}

module.exports = requireAuth;
