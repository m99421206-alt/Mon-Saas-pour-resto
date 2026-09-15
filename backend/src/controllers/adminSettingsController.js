/**
 * Lecture / mise à jour des réglages plateforme — admin uniquement.
 */

var platformSettings = require("../services/platformSettings");
var { appendAudit, AUDIT_ACTIONS, ACTOR_TYPES } = require("../utils/auditLog");
var { parsePlatformSettingsBody } = require("../validators/settings");
var { sendValidationError } = require("../validators/helpers");

async function getSettings(req, res) {
  try {
    await platformSettings.refresh();
    return res.json(platformSettings.getSnapshot());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les paramètres." });
  }
}

async function putSettings(req, res) {
  try {
    var parsed = parsePlatformSettingsBody(req.body || {});
    if (sendValidationError(parsed, res)) {
      return;
    }
    var patch = parsed.data;
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: "Aucun paramètre valide à mettre à jour." });
    }

    var result = await platformSettings.savePartial(patch);

    if (result.persisted) {
      var adminId = Number(req.user.id);
      await appendAudit({
        userId: Number.isInteger(adminId) ? adminId : null,
        restaurantId: null,
        actorType: ACTOR_TYPES.ADMIN,
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        detail: "Mise à jour des paramètres plateforme (admin)",
      });
    }

    return res.json({
      ok: true,
      settings: result.snapshot,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible d’enregistrer les paramètres." });
  }
}

module.exports = {
  getSettings: getSettings,
  putSettings: putSettings,
};
