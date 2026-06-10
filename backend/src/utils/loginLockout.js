/**
 * Limitation des tentatives de connexion — 5 échecs → blocage temporaire.
 * Clé : email normalisé + adresse IP (stockage en mémoire, adapté à un serveur unique).
 */

"use strict";

var MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
var LOCKOUT_MS = (Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15) * 60 * 1000;

/** @type {Map<string, { failures: number, lockedUntil: number }>} */
var store = new Map();

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function makeKey(email, ip) {
  return normalizeEmail(email) + "::" + String(ip || "unknown");
}

function getClientIp(req) {
  return (req.socket && req.socket.remoteAddress) || req.ip || "unknown";
}

function getEntry(key) {
  var entry = store.get(key);
  if (!entry) {
    return null;
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    store.delete(key);
    return null;
  }
  return entry;
}

function checkLockout(email, ip) {
  var key = makeKey(email, ip);
  var entry = getEntry(key);

  if (!entry) {
    return { allowed: true };
  }

  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.lockedUntil - Date.now()) / 1000),
    };
  }

  return { allowed: true };
}

function recordFailure(email, ip) {
  var key = makeKey(email, ip);
  var entry = getEntry(key) || { failures: 0, lockedUntil: 0 };

  entry.failures += 1;

  if (entry.failures >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    store.set(key, entry);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000),
    };
  }

  store.set(key, entry);
  return { allowed: true };
}

function recordSuccess(email, ip) {
  store.delete(makeKey(email, ip));
}

function formatLockoutMessage(retryAfterSeconds) {
  var seconds = Math.max(1, Number(retryAfterSeconds) || 60);
  var minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) {
    return "Trop de tentatives. Réessayez dans environ une minute.";
  }
  return (
    "Trop de tentatives. Connexion temporairement bloquée. Réessayez dans " +
    minutes +
    " minutes."
  );
}

function sendLockoutResponse(res, retryAfterSeconds) {
  var retry = Math.max(1, Number(retryAfterSeconds) || 60);
  res.set("Retry-After", String(retry));
  return res.status(429).json({
    message: formatLockoutMessage(retry),
    retry_after_seconds: retry,
  });
}

setInterval(function () {
  var now = Date.now();
  store.forEach(function (entry, key) {
    if (entry.lockedUntil && now >= entry.lockedUntil) {
      store.delete(key);
    }
  });
}, 10 * 60 * 1000).unref();

module.exports = {
  getClientIp: getClientIp,
  checkLockout: checkLockout,
  recordFailure: recordFailure,
  recordSuccess: recordSuccess,
  sendLockoutResponse: sendLockoutResponse,
};
