const { getPool } = require("../config/database");

function normalizeText(value) {
  if (value == null) {
    return null;
  }
  var text = String(value).trim();
  return text.length ? text : null;
}

function normalizeWhatsapp(value) {
  var text = normalizeText(value);
  if (!text) {
    return null;
  }

  var cleaned = text.replace(/\s+/g, "");
  if (!/^\+?[0-9]{8,20}$/.test(cleaned)) {
    return false;
  }
  return cleaned;
}

function normalizeThemeColor(value) {
  var text = normalizeText(value);
  if (!text) {
    return "#FF7A51";
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(text)) {
    return false;
  }
  return text.toUpperCase();
}

async function getRestaurantForUser(userId) {
  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT id, name, description, whatsapp, logo_url, banner_url, theme_color FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

async function getMyRestaurant(req, res) {
  try {
    var restaurant = await getRestaurantForUser(req.user.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    return res.json({ restaurant: restaurant });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function updateMyRestaurant(req, res) {
  try {
    var name = normalizeText(req.body.name || req.body.restaurantName);
    var description = normalizeText(req.body.description);
    var whatsapp = normalizeWhatsapp(req.body.whatsapp);
    var logoUrl = normalizeText(req.body.logo_url || req.body.logoUrl);
    var bannerUrl = normalizeText(req.body.banner_url || req.body.bannerUrl);
    var themeColor = normalizeThemeColor(req.body.theme_color || req.body.themeColor);

    if (!name) {
      return res.status(400).json({ message: "Le nom du restaurant est requis." });
    }
    if (whatsapp === false) {
      return res.status(400).json({ message: "Numéro WhatsApp invalide. Exemple : +22370000000" });
    }
    if (themeColor === false) {
      return res.status(400).json({ message: "Couleur de thème invalide. Exemple : #FF7A51" });
    }

    var pool = getPool();
    var [result] = await pool.query(
      "UPDATE restaurants SET name = ?, description = ?, whatsapp = ?, logo_url = ?, banner_url = ?, theme_color = ? WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      [name, description, whatsapp, logoUrl, bannerUrl, themeColor, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var restaurant = await getRestaurantForUser(req.user.id);
    return res.json({ restaurant: restaurant });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getMyRestaurant: getMyRestaurant,
  updateMyRestaurant: updateMyRestaurant,
};
