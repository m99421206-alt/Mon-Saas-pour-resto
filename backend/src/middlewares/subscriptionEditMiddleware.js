/**
 * Bloque les écritures menu / médias / fiche resto si abonnement expiré ou suspendu.
 * Les GET (liste produits, etc.) restent autorisés pour consultation.
 */

var subscriptionService = require("../services/subscriptionService");

async function requireRestaurantMenuEdit(req, res, next) {
  try {
    var r = await subscriptionService.assertCanEditRestaurantMenu(req.user.id);
    if (!r.ok) {
      return res.status(403).json({
        message: r.message,
        code: r.code,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireRestaurantMenuEdit;
