const { getPool } = require("../config/database");
const { removeUnusedUploads } = require("../utils/uploadCleanup");
const { normalizeWhatsapp: normalizeWhatsappField } = require("../utils/whatsappNormalize");

function normalizeText(value) {
  if (value == null) {
    return null;
  }
  var text = String(value).trim();
  return text.length ? text : null;
}

function normalizeThemeColor(value) {
  var text = normalizeText(value);
  if (!text) {
    return "#FF7A00";
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(text)) {
    return false;
  }
  return text.toUpperCase();
}

function collectRestaurantUploadUrls(logoUrl, bannerUrl) {
  var urls = [];
  if (logoUrl) {
    urls.push(logoUrl);
  }
  if (bannerUrl) {
    urls.push(bannerUrl);
  }
  return urls;
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
    var whatsapp = normalizeWhatsappField(req.body.whatsapp);
    var logoUrl = normalizeText(req.body.logo_url || req.body.logoUrl);
    var bannerUrl = normalizeText(req.body.banner_url || req.body.bannerUrl);
    var themeColor = normalizeThemeColor(req.body.theme_color || req.body.themeColor);

    if (!name) {
      await removeUnusedUploads(collectRestaurantUploadUrls(logoUrl, bannerUrl));
      return res.status(400).json({ message: "Le nom du restaurant est requis." });
    }
    if (whatsapp === false) {
      await removeUnusedUploads(collectRestaurantUploadUrls(logoUrl, bannerUrl));
      return res.status(400).json({ message: "Numéro WhatsApp invalide. Exemple : +22370000000" });
    }
    if (themeColor === false) {
      await removeUnusedUploads(collectRestaurantUploadUrls(logoUrl, bannerUrl));
      return res.status(400).json({ message: "Couleur de thème invalide. Exemple : #FF7A00" });
    }

    var pool = getPool();
    var oldImages = [];
    var previousRestaurant = await getRestaurantForUser(req.user.id);
    if (previousRestaurant) {
      if (previousRestaurant.logo_url && previousRestaurant.logo_url !== logoUrl) {
        oldImages.push(previousRestaurant.logo_url);
      }
      if (previousRestaurant.banner_url && previousRestaurant.banner_url !== bannerUrl) {
        oldImages.push(previousRestaurant.banner_url);
      }
    }

    var [result] = await pool.query(
      "UPDATE restaurants SET name = ?, description = ?, whatsapp = ?, logo_url = ?, banner_url = ?, theme_color = ? WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      [name, description, whatsapp, logoUrl, bannerUrl, themeColor, req.user.id]
    );

    if (result.affectedRows === 0) {
      await removeUnusedUploads(collectRestaurantUploadUrls(logoUrl, bannerUrl));
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var restaurant = await getRestaurantForUser(req.user.id);
    await removeUnusedUploads(oldImages);
    return res.json({ restaurant: restaurant });
  } catch (err) {
    await removeUnusedUploads(collectRestaurantUploadUrls(logoUrl, bannerUrl));
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getMyRestaurant: getMyRestaurant,
  updateMyRestaurant: updateMyRestaurant,
};
