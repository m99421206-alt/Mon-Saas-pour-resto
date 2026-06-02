/**
 * Attache le restaurant du compte connecté et refuse tout restaurant_id étranger.
 */

"use strict";

var ownership = require("../utils/restaurantOwnership");

async function requireRestaurantOwner(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Authentification requise." });
    }

    var restaurant = await ownership.getRestaurantForUser(req.user.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    req.restaurantId = restaurant.id;
    req.restaurant = restaurant;

    var requestedId = ownership.parseRequestedRestaurantId(req);
    if (requestedId !== null && requestedId !== restaurant.id) {
      return ownership.sendForbidden(res);
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireRestaurantOwner;
