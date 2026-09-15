/**
 * Vérifie le rejet des booléens et dates invalides.
 * Usage : node scripts/verify-bool-date-validation.js
 */

"use strict";

var { parseProductBody, parseProductVisibilityBody } = require("../src/validators/product");
var { parseMenuSuspendedBody } = require("../src/validators/restaurant");
var { parseAdjustBody } = require("../src/validators/subscription");
var { parsePlatformSettingsBody } = require("../src/validators/settings");

function expectFail(label, fn) {
  var result = fn();
  if (result.ok) {
    throw new Error(label + " — attendu échec, reçu succès");
  }
}

function expectOk(label, fn) {
  var result = fn();
  if (!result.ok) {
    throw new Error(label + " — attendu succès, reçu : " + result.message);
  }
}

function run() {
  expectFail("produit is_visible=abc", function () {
    return parseProductBody({
      name: "Test",
      price: 1000,
      category_id: 1,
      is_visible: "abc",
    });
  });

  expectOk("produit is_visible=false (bool)", function () {
    return parseProductBody({
      name: "Test",
      price: 1000,
      category_id: 1,
      is_visible: false,
    });
  });

  expectOk("produit is_visible=\"false\" (string)", function () {
    return parseProductBody({
      name: "Test",
      price: 1000,
      category_id: 1,
      is_visible: "false",
    });
  });

  expectFail("visibilité sans is_visible", function () {
    return parseProductVisibilityBody({});
  });

  expectOk("visibilité is_visible=0", function () {
    return parseProductVisibilityBody({ is_visible: 0 });
  });

  expectFail("menu_suspended=abc", function () {
    return parseMenuSuspendedBody({ menu_suspended: "abc" });
  });

  expectOk("menu_suspended=false", function () {
    return parseMenuSuspendedBody({ menu_suspended: false });
  });

  expectFail("subscription_ends_at=2026-99-99", function () {
    return parseAdjustBody({ subscription_ends_at: "2026-99-99" });
  });

  expectFail("subscription_ends_at=abc", function () {
    return parseAdjustBody({ subscription_ends_at: "abc" });
  });

  expectOk("subscription_ends_at valide", function () {
    return parseAdjustBody({ subscription_ends_at: "2026-09-14" });
  });

  expectFail("maintenance_mode=abc", function () {
    return parsePlatformSettingsBody({ maintenance_mode: "abc" });
  });

  expectOk("maintenance_mode=false", function () {
    return parsePlatformSettingsBody({ maintenance_mode: "false" });
  });

  console.log("OK — validation booléenne et dates");
}

run();
