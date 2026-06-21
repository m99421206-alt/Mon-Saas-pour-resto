/**
 * Endpoints publics — création de notifications admin (MVP, rate-limit côté serveur).
 */

const {
  createAdminNotification,
  NOTIFICATION_TYPES,
} = require("../services/adminNotificationService");

async function postPasswordResetRequest(req, res) {
  try {
    var restaurantName = String(req.body.restaurantName || req.body.restaurant_name || "").trim();
    var phone = String(req.body.phone || "").trim();

    if (!restaurantName && !phone) {
      return res.status(400).json({ message: "Indiquez au moins le nom du restaurant ou un téléphone." });
    }

    var detail =
      "Demande de réinitialisation de mot de passe" +
      (phone ? " — Tél. : " + phone.slice(0, 32) : "") +
      (restaurantName ? " — Restaurant : " + restaurantName.slice(0, 120) : "");

    await createAdminNotification({
      type: NOTIFICATION_TYPES.PASSWORD_RESET,
      restaurantName: restaurantName || "—",
      phone: phone || null,
      detail: detail,
      linkUrl: "admin-users.html",
    });

    return res.status(201).json({ ok: true, message: "Demande enregistrée." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  postPasswordResetRequest: postPasswordResetRequest,
};
