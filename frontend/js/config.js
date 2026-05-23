(function () {
  "use strict";

  var API_PORT = "4000";
  var hostname = window.location.hostname || "127.0.0.1";
  var protocol = window.location.protocol === "https:" ? "https:" : "http:";
  var defaultApiUrl = protocol + "//" + hostname + ":" + API_PORT;
  var existingConfig = window.AFRICAMENU_CONFIG || {};

  window.AFRICAMENU_CONFIG = Object.assign({}, existingConfig, {
    API_URL: existingConfig.API_URL || defaultApiUrl,
    SUPPORT_EMAIL:
      typeof existingConfig.SUPPORT_EMAIL === "string" ? existingConfig.SUPPORT_EMAIL : "",
    /** Numéro WhatsApp plateforme (chiffres, forme internationale sans + dans l’URL) — optionnel si le restaurant a son WhatsApp dans Paramètres. */
    SUPPORT_WHATSAPP:
      typeof existingConfig.SUPPORT_WHATSAPP === "string" ? existingConfig.SUPPORT_WHATSAPP : "",
  });
})();
