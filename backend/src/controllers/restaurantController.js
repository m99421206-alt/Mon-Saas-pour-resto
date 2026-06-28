const { getPool } = require("../config/database");
const { removeUnusedUploads } = require("../utils/uploadCleanup");
const { normalizeWhatsapp: normalizeWhatsappField } = require("../utils/whatsappNormalize");
const ownership = require("../utils/restaurantOwnership");
const { normalizeStoredImageUrl } = require("../utils/imageUrlValidation");
const { appendAuditFromRequest, AUDIT_ACTIONS } = require("../utils/auditLog");
const uploadOwnership = require("../utils/uploadOwnership");

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
  return ownership.getRestaurantForUser(userId);
}

async function getMyRestaurant(req, res) {
  try {
    var restaurant = req.restaurant || (await getRestaurantForUser(req.user.id));
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
    var logoUrl = normalizeStoredImageUrl(req.body.logo_url || req.body.logoUrl);
    var bannerUrl = normalizeStoredImageUrl(req.body.banner_url || req.body.bannerUrl);
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
    if (logoUrl === false || bannerUrl === false) {
      return res.status(400).json({ message: "Image invalide. Utilisez une image uploadée par AfricaMenu." });
    }

    var previousRestaurant = req.restaurant || (await getRestaurantForUser(req.user.id));
    var restaurantId = req.restaurantId || (previousRestaurant ? previousRestaurant.id : null);

    if (restaurantId) {
      var uploadStatus = await uploadOwnership.assertUploadUrlsAllowedForRestaurant(
        collectRestaurantUploadUrls(logoUrl, bannerUrl),
        restaurantId
      );
      if (uploadStatus === "forbidden") {
        await removeUnusedUploads(collectRestaurantUploadUrls(logoUrl, bannerUrl));
        return uploadOwnership.sendUploadForbidden(res);
      }
      if (uploadStatus === "invalid") {
        await removeUnusedUploads(collectRestaurantUploadUrls(logoUrl, bannerUrl));
        return res.status(400).json({ message: "Image invalide. Utilisez une image uploadée par AfricaMenu." });
      }
    }

    var pool = getPool();
    var oldImages = [];
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

    /** Garde users.phone aligné avec le WhatsApp commandes (= contact principal du compte). */
    await pool.query("UPDATE users SET phone = ? WHERE id = ?", [whatsapp, req.user.id]);

    var restaurant = await getRestaurantForUser(req.user.id);
    await removeUnusedUploads(oldImages);

    if (restaurant && restaurant.id) {
      await appendAuditFromRequest(req, {
        restaurantId: restaurant.id,
        action: AUDIT_ACTIONS.RESTAURANT_SETTINGS_UPDATE,
        detail: "Mise à jour paramètres restaurant (« " + String(name).slice(0, 160) + " »)",
      });
    }

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
