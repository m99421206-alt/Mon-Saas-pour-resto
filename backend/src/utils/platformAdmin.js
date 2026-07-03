/**
 * Administration plateforme — liste ADMIN_EMAILS (env), validation au démarrage, journalisation refus.
 */

"use strict";

var { appendAudit, AUDIT_ACTIONS } = require("./auditLog");
var loginLockout = require("./loginLockout");

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

function parseAdminEmailAllowlist() {
  var raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map(function (s) {
      return s.trim().toLowerCase();
    })
    .filter(Boolean);
}

/**
 * Production : ADMIN_EMAILS obligatoire (au moins un email), sinon le serveur refuse de démarrer.
 * Développement : avertissement si vide — les routes /api/admin/* restent refusées (403).
 */
function validateAdminEmailsAtStartup() {
  var allow = parseAdminEmailAllowlist();

  if (isProductionEnv()) {
    if (allow.length === 0) {
      throw new Error(
        "Configuration production invalide : ADMIN_EMAILS doit contenir au moins un email administrateur " +
          "(séparés par des virgules dans backend/.env).",
      );
    }
    return;
  }

  if (allow.length === 0) {
    console.warn(
      "[AfricaMenu] ADMIN_EMAILS est vide — les routes /api/admin/* seront refusées (403). " +
        "Ajoutez au moins un email dans backend/.env pour tester l'administration.",
    );
  }
}

function isPlatformAdminEmail(email) {
  var normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return false;
  }

  var allow = parseAdminEmailAllowlist();
  if (!allow.length) {
    return false;
  }

  return allow.indexOf(normalized) !== -1;
}

/**
 * Journalise une tentative d'accès admin refusée (console + audit best-effort).
 * @param {import("express").Request} req
 * @param {string|null|undefined} email
 * @param {string} reason
 */
function logAdminAccessDenied(req, email, reason) {
  var ip = loginLockout.getClientIp(req);
  var route = String((req && (req.originalUrl || req.url)) || "unknown").slice(0, 240);
  var normalizedEmail =
    String(email || "")
      .trim()
      .toLowerCase() || "unknown";
  var safeReason = String(reason || "denied").slice(0, 80);
  var at = new Date().toISOString();

  console.warn(
    "[security] Accès admin refusé | email=" +
      normalizedEmail +
      " | ip=" +
      ip +
      " | route=" +
      route +
      " | reason=" +
      safeReason +
      " | at=" +
      at,
  );

  appendAudit({
    userId: req && req.user && req.user.id ? req.user.id : null,
    action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED,
    detail:
      "Accès admin refusé — route=" +
      route +
      ", ip=" +
      String(ip).slice(0, 45) +
      ", reason=" +
      safeReason,
    actorType: "restaurant",
  }).catch(function () {});
}

module.exports = {
  parseAdminEmailAllowlist: parseAdminEmailAllowlist,
  validateAdminEmailsAtStartup: validateAdminEmailsAtStartup,
  isPlatformAdminEmail: isPlatformAdminEmail,
  logAdminAccessDenied: logAdminAccessDenied,
};
