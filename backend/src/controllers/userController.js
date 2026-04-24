const { getPool } = require("../config/database");

/**
 * Profil minimal du compte connecté (route protégée exemple)
 */
async function getMe(req, res) {
  try {
    var pool = getPool();
    var [rows] = await pool.query("SELECT id, email FROM users WHERE id = ? LIMIT 1", [req.user.id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    var [restaurants] = await pool.query(
      "SELECT id, name, description FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      [req.user.id]
    );

    return res.json({
      user: rows[0],
      restaurant: restaurants[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getMe: getMe,
};
