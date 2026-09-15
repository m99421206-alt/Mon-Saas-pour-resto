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

var BOOL_TINYINT_MESSAGE =
  "Valeur booléenne invalide. Utilisez true, false, 0, 1, \"true\" ou \"false\".";

var DATE_YMD_MESSAGE =
  "Date invalide. Utilisez le format AAAA-MM-DD (ex. 2026-09-14).";

function parseBoolTinyint(value) {
  if (value === true || value === 1 || value === "1") {
    return 1;
  }
  if (value === false || value === 0 || value === "0") {
    return 0;
  }
  if (typeof value === "string") {
    var normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return 1;
    }
    if (normalized === "false") {
      return 0;
    }
  }
  return null;
}

function isValidDateYmd(value) {
  if (typeof value !== "string") {
    return false;
  }
  var trimmed = value.trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(trimmed)) {
    return false;
  }
  var parts = trimmed.split("-");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);
  var date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

var boolTinyintInput = z
  .union([z.boolean(), z.number(), z.string()])
  .refine(function (value) {
    return parseBoolTinyint(value) !== null;
  }, { message: BOOL_TINYINT_MESSAGE })
  .transform(function (value) {
    return parseBoolTinyint(value);
  });

var optionalBoolTinyintField = boolTinyintInput.optional();

/** @deprecated Préférer boolTinyintInput / optionalBoolTinyintField */
var boolLikeField = optionalBoolTinyintField;

var dateYmdField = z
  .string({ required_error: DATE_YMD_MESSAGE })
  .trim()
  .refine(isValidDateYmd, { message: DATE_YMD_MESSAGE });

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
  boolTinyintInput: boolTinyintInput,
  optionalBoolTinyintField: optionalBoolTinyintField,
  boolLikeField: boolLikeField,
  dateYmdField: dateYmdField,
  parseBoolTinyint: parseBoolTinyint,
  isValidDateYmd: isValidDateYmd,
  BOOL_TINYINT_MESSAGE: BOOL_TINYINT_MESSAGE,
  DATE_YMD_MESSAGE: DATE_YMD_MESSAGE,
  parseWhatsappRequired: parseWhatsappRequired,
  parseWhatsappOptional: parseWhatsappOptional,
  pickQuartier: pickQuartier,
};
