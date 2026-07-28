(function () {
  "use strict";

  var API_PORT = "4000";
  var hostname = window.location.hostname || "127.0.0.1";
  var protocol = window.location.protocol === "https:" ? "https:" : "http:";
  var isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.indexOf("192.168.") === 0 ||
    hostname.indexOf("10.") === 0 ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  // En local : http://localhost:4000
  // En production : "/api" (pour que /me devienne /api/me)
  var defaultApiUrl = isLocalHost
    ? protocol + "//" + hostname + ":" + API_PORT
    : "/api"; // CORRIGÉ : On met "/api" pour router vers le backend via Nginx

  var existingConfig = window.MenuGo_CONFIG || {};

  window.MenuGo_CONFIG = Object.assign({}, existingConfig, {
    API_URL: existingConfig.API_URL || defaultApiUrl,
    SUPPORT_EMAIL:
      typeof existingConfig.SUPPORT_EMAIL === "string"
        ? existingConfig.SUPPORT_EMAIL
        : "",
    SUPPORT_WHATSAPP:
      typeof existingConfig.SUPPORT_WHATSAPP === "string" &&
      existingConfig.SUPPORT_WHATSAPP.trim() !== ""
        ? existingConfig.SUPPORT_WHATSAPP
        : "22399421206",

    PUBLIC_SITE_ORIGIN:
      typeof existingConfig.PUBLIC_SITE_ORIGIN === "string" &&
      existingConfig.PUBLIC_SITE_ORIGIN !== ""
        ? existingConfig.PUBLIC_SITE_ORIGIN
        : window.location.origin,
  });
})();
