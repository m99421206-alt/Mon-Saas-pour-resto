/**
 * Endpoints publics — création de notifications admin (MVP, rate-limit côté serveur).
 */

const {
  createAdminNotification,
  NOTIFICATION_TYPES,
} = require("../services/adminNotificationService");
const { parsePasswordResetRequestBody } = require("../validators/support");
const { sendValidationError } = require("../validators/helpers");

async function postPasswordResetRequest(req, res) {
  try {
    var parsed = parsePasswordResetRequestBody(req.body);
    if (sendValidationError(parsed, res)) {
      return;
    }
    var restaurantName = parsed.data.restaurantName;
    var phone = parsed.data.phone;

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
