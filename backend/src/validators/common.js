/**
 * Schémas Zod partagés.
 */

"use strict";

var { z } = require("zod");
var { isValidEmail, emailFormatMessage } = require("../utils/emailValidate");
var { normalizeWhatsapp } = require("../utils/whatsappNormalize");

var emailField = z
  .string({ required_error: "Email obligatoire." })
  .trim()
  .toLowerCase()
  .refine(isValidEmail, { message: emailFormatMessage() });

var passwordField = z
  .string({ required_error: "Mot de passe obligatoire." })
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.");

var positiveIntId = z.coerce.number().int().positive("Identifiant invalide.");

var themeColorField = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Couleur de thème invalide. Exemple : #FF7A00")
  .transform(function (v) {
    return v.toUpperCase();
  });

var boolLikeField = z
  .union([z.boolean(), z.number(), z.string()])
  .optional()
  .transform(function (v) {
    if (v === true || v === 1 || v === "1") {
      return 1;
    }
    if (v === false || v === 0 || v === "0") {
      return 0;
    }
    return 1;
  });

function parseWhatsappRequired(raw) {
  var wa = normalizeWhatsapp(raw);
  if (wa === null) {
    return { ok: false, message: "Le numéro de téléphone principal (WhatsApp pour les commandes) est obligatoire." };
  }
  if (wa === false) {
    return { ok: false, message: "Numéro WhatsApp invalide. Exemple : +22370000000" };
  }
  return { ok: true, value: wa };
}

function parseWhatsappOptional(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, value: null };
  }
  var wa = normalizeWhatsapp(raw);
  if (wa === false) {
    return { ok: false, message: "Numéro WhatsApp invalide. Exemple : +22370000000" };
  }
  return { ok: true, value: wa };
}

function pickQuartier(body) {
  var b = body || {};
  if (typeof b.city === "string" && b.city.trim()) {
    return b.city.trim().slice(0, 120);
  }
  if (typeof b.location === "string" && b.location.trim()) {
    return b.location.trim().slice(0, 120);
  }
  if (typeof b.quartier === "string" && b.quartier.trim()) {
    return b.quartier.trim().slice(0, 120);
  }
  return null;
}

module.exports = {
  z: z,
  emailField: emailField,
  passwordField: passwordField,
  positiveIntId: positiveIntId,
  themeColorField: themeColorField,
  boolLikeField: boolLikeField,
  parseWhatsappRequired: parseWhatsappRequired,
  parseWhatsappOptional: parseWhatsappOptional,
  pickQuartier: pickQuartier,
};
