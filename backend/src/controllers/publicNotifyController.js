/**
 * Endpoints publics — création de notifications admin (MVP, rate-limit côté serveur).
 */

const {
  createAdminNotification,
  NOTIFICATION_TYPES,
} = require("../services/adminNotificationService");
const setupAssistanceService = require("../services/setupAssistanceService");
const {
  parsePasswordResetRequestBody,
  parseInstallationRequestBody,
} = require("../validators/support");
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

async function postInstallationRequest(req, res) {
  try {
    var parsed = parseInstallationRequestBody(req.body);
    if (sendValidationError(parsed, res)) {
      return;
    }
    var data = parsed.data;

    var created = await setupAssistanceService.createLandingRequest({
      restaurantName: data.restaurantName,
      contactName: data.fullName,
      phone: data.whatsapp,
      city: data.city,
    });

    var detail =
      "Demande d'installation — Gérant : " +
      data.fullName +
      " — Ville : " +
      data.city;

    await createAdminNotification({
      type: NOTIFICATION_TYPES.INSTALLATION_REQUEST,
      restaurantName: data.restaurantName,
      phone: data.whatsapp,
      detail: detail,
      linkUrl: "admin-installation-requests.html",
    });

    return res.status(201).json({
      ok: true,
      message: created.duplicate ?
        "Votre demande est déjà en cours de traitement."
      : "Demande enregistrée.",
      requestId: created.id,
    });
  } catch (err) {
    if (setupAssistanceService.isMissingTableError(err)) {
      return res.status(503).json({
        message: "Service temporairement indisponible. Réessayez plus tard.",
      });
    }
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  postPasswordResetRequest: postPasswordResetRequest,
  postInstallationRequest: postInstallationRequest,
};
