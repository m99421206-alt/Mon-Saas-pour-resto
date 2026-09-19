/**
 * Demandes d'assistance installation — CRM admin.
 */

var { getPool } = require("../config/database");
var { appendAudit, AUDIT_ACTIONS, ACTOR_TYPES } = require("../utils/auditLog");
var setupAssistanceService = require("../services/setupAssistanceService");
var { createRestaurantAccount } = require("../services/restaurantSignupService");
var {
  createAdminNotification,
  NOTIFICATION_TYPES,
} = require("../services/adminNotificationService");
var {
  parseSetupHelpIdParams,
  parsePatchSetupHelpStatusBody,
  parseLinkSetupHelpRestaurantBody,
  parseAddNoteBody,
  parseChecklistBody,
  parseCreateRestaurantFromRequestBody,
  parseSetupHelpListQuery,
} = require("../validators/setupAssistance");
var { parseRegisterBody } = require("../validators/auth");
var { sendValidationError } = require("../validators/helpers");
var {
  isMysqlUnavailableError,
  mysqlUnavailablePayload,
} = require("../utils/mysqlErrors");

function adminId(req) {
  return Number(req.user && req.user.id);
}

async function listSetupHelp(req, res) {
  try {
    var query = parseSetupHelpListQuery(req.query || {});
    var result = await setupAssistanceService.listRequests(query);
    return res.json(result);
  } catch (err) {
    if (setupAssistanceService.isMissingTableError(err)) {
      return res.status(503).json({
        message: "Migration requise. Exécutez npm run db:setup-assistance-crm.",
      });
    }
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les demandes d'assistance." });
  }
}

async function getSetupHelpStats(req, res) {
  try {
    var stats = await setupAssistanceService.getStats();
    return res.json(stats);
  } catch (err) {
    if (setupAssistanceService.isMissingTableError(err)) {
      return res.status(503).json({ message: "Migration requise." });
    }
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les statistiques." });
  }
}

async function getSetupHelpDetail(req, res) {
  try {
    var idParsed = parseSetupHelpIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var detail = await setupAssistanceService.getRequestDetail(idParsed.data.id);
    if (!detail) {
      return res.status(404).json({ message: "Demande introuvable." });
    }
    return res.json({ request: detail });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function patchSetupHelpStatus(req, res) {
  try {
    var idParsed = parseSetupHelpIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var bodyParsed = parsePatchSetupHelpStatusBody(req.body);
    if (sendValidationError(bodyParsed, res)) {
      return;
    }

    var result = await setupAssistanceService.updateRequestStatus(
      idParsed.data.id,
      bodyParsed.data.status,
      adminId(req),
    );

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "Demande introuvable." });
    }
    if (result.error === "INVALID_STATUS") {
      return res.status(400).json({ message: "Statut invalide." });
    }
    if (result.error === "INVALID_TRANSITION") {
      return res.status(400).json({
        message:
          "Transition de statut non autorisée (" +
          setupAssistanceService.STATUS_LABELS[result.from] +
          " → " +
          setupAssistanceService.STATUS_LABELS[result.to] +
          ").",
      });
    }

    if (bodyParsed.data.status === "completed") {
      var requestRow = await setupAssistanceService.getRequestById(idParsed.data.id);
      await appendAudit({
        userId: adminId(req),
        restaurantId:
          requestRow ?
            requestRow.restaurant_id || requestRow.linked_restaurant_id || null
          : null,
        actorType: ACTOR_TYPES.ADMIN,
        action: AUDIT_ACTIONS.SETUP_HELP_COMPLETE,
        detail:
          "Installation terminée (« " +
          String((requestRow && requestRow.restaurant_name) || "") +
          " »)",
      });
    }

    return res.json({
      ok: true,
      id: idParsed.data.id,
      status: result.status,
      status_label: setupAssistanceService.STATUS_LABELS[result.status] || result.status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function postSetupHelpContact(req, res) {
  try {
    var idParsed = parseSetupHelpIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var result = await setupAssistanceService.markContacted(idParsed.data.id, adminId(req));
    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "Demande introuvable." });
    }
    return res.json({ ok: true, message: "Contact enregistré." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function postSetupHelpNote(req, res) {
  try {
    var idParsed = parseSetupHelpIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var bodyParsed = parseAddNoteBody(req.body);
    if (sendValidationError(bodyParsed, res)) {
      return;
    }
    var result = await setupAssistanceService.addNote(
      idParsed.data.id,
      bodyParsed.data.note,
      adminId(req),
    );
    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "Demande introuvable." });
    }
    if (result.error === "EMPTY_NOTE") {
      return res.status(400).json({ message: "Note vide." });
    }
    return res.status(201).json({ ok: true, event_id: result.event_id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function patchSetupHelpChecklist(req, res) {
  try {
    var idParsed = parseSetupHelpIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var bodyParsed = parseChecklistBody(req.body);
    if (sendValidationError(bodyParsed, res)) {
      return;
    }
    var result = await setupAssistanceService.updateChecklist(
      idParsed.data.id,
      bodyParsed.data.checklist,
      adminId(req),
    );
    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "Demande introuvable." });
    }
    return res.json({ ok: true, checklist: result.checklist });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function patchSetupHelpLinkRestaurant(req, res) {
  try {
    var idParsed = parseSetupHelpIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var bodyParsed = parseLinkSetupHelpRestaurantBody(req.body);
    if (sendValidationError(bodyParsed, res)) {
      return;
    }

    var result = await setupAssistanceService.linkRestaurantToRequest(
      idParsed.data.id,
      bodyParsed.data.linked_restaurant_id,
      adminId(req),
    );

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "Demande introuvable." });
    }
    if (result.error === "RESTAURANT_NOT_FOUND") {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }
    if (result.error === "INVALID_RESTAURANT") {
      return res.status(400).json({ message: "Identifiant restaurant invalide." });
    }

    return res.json({
      ok: true,
      id: idParsed.data.id,
      linked_restaurant_id: result.linked_restaurant_id,
      linked_restaurant_name: result.linked_restaurant_name,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function postSetupHelpCreateRestaurant(req, res) {
  var idParsed = parseSetupHelpIdParams(req.params);
  if (sendValidationError(idParsed, res)) {
    return;
  }

  var requestRow = await setupAssistanceService.getRequestById(idParsed.data.id);
  if (!requestRow) {
    return res.status(404).json({ message: "Demande introuvable." });
  }

  var body = Object.assign({}, req.body || {});
  if (!body.restaurantName && requestRow.restaurant_name) {
    body.restaurantName = requestRow.restaurant_name;
  }
  if (!body.fullName && requestRow.contact_name) {
    body.fullName = requestRow.contact_name;
  }
  if (!body.whatsapp && requestRow.phone) {
    body.whatsapp = requestRow.phone;
  }
  if (!body.quartier && !body.city && requestRow.city) {
    body.quartier = requestRow.city;
  }

  var parsed = parseRegisterBody(body);
  if (sendValidationError(parsed, res)) {
    return;
  }

  try {
    var created = await createRestaurantAccount(parsed.data);

    await setupAssistanceService.linkRestaurantToRequest(
      idParsed.data.id,
      created.restaurantId,
      adminId(req),
    );

    await setupAssistanceService.recordRestaurantCreated(
      idParsed.data.id,
      adminId(req),
      created,
    );

    await appendAudit({
      userId: adminId(req),
      restaurantId: created.restaurantId,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.USER_REGISTER,
      detail:
        "Création depuis demande d'installation (#" +
        idParsed.data.id +
        ") — « " +
        created.restaurantName +
        " »",
    });

    await createAdminNotification({
      type: NOTIFICATION_TYPES.NEW_RESTAURANT,
      userId: created.userId,
      restaurantId: created.restaurantId,
      restaurantName: created.restaurantName,
      phone: created.whatsapp,
      detail: "Restaurant créé depuis demande d'installation",
      linkUrl: "admin-restaurants.html",
    });

    return res.status(201).json({
      ok: true,
      message: "Compte restaurant créé et lié à la demande.",
      user: {
        id: created.userId,
        email: created.email,
        full_name: created.fullName,
        phone: created.whatsapp,
      },
      restaurant: {
        id: created.restaurantId,
        name: created.restaurantName,
        slug: created.restaurantRow.slug || null,
        quartier: created.quartier,
        whatsapp: created.whatsapp,
      },
    });
  } catch (err) {
    if (err && err.code === "EMAIL_IN_USE") {
      return res.status(409).json({ message: "Cet email est déjà utilisé." });
    }
    console.error(err);
    if (isMysqlUnavailableError(err)) {
      return res.status(503).json(mysqlUnavailablePayload());
    }
    return res.status(500).json({ message: "Erreur serveur lors de la création." });
  }
}

async function postSetupHelpComplete(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    var pool = getPool();
    var [[restaurantRow]] = await pool.query(
      "SELECT id, name, needs_setup_help FROM restaurants WHERE id = ? LIMIT 1",
      [id],
    );

    if (!restaurantRow) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    await setupAssistanceService.completeByRestaurantId(id);

    await appendAudit({
      userId: adminId(req),
      restaurantId: id,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.SETUP_HELP_COMPLETE,
      detail: "Installation terminée (« " + String(restaurantRow.name || "") + " »)",
    });

    return res.json({
      ok: true,
      message: "Demande marquée comme traitée.",
      needs_setup_help: false,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  listSetupHelp: listSetupHelp,
  getSetupHelpStats: getSetupHelpStats,
  getSetupHelpDetail: getSetupHelpDetail,
  patchSetupHelpStatus: patchSetupHelpStatus,
  postSetupHelpContact: postSetupHelpContact,
  postSetupHelpNote: postSetupHelpNote,
  patchSetupHelpChecklist: patchSetupHelpChecklist,
  patchSetupHelpLinkRestaurant: patchSetupHelpLinkRestaurant,
  postSetupHelpCreateRestaurant: postSetupHelpCreateRestaurant,
  postSetupHelpComplete: postSetupHelpComplete,
};
