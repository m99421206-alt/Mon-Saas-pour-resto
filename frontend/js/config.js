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

  // En local, on pointe vers l'API sur le port 4000.
  // En production, on utilise la route relative "/api" gérée par le Reverse Proxy Nginx.
  var defaultApiUrl = isLocalHost
    ? protocol + "//" + hostname + ":" + API_PORT
    : "/api"; // <--- MODIFIÉ ICI (remplacé "" par "/api")

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
