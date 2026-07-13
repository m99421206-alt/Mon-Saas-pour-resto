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
  var defaultApiUrl = isLocalHost ? protocol + "//" + hostname + ":" + API_PORT : window.location.origin;
  var existingConfig = window.MenuGo_CONFIG || {};

  window.MenuGo_CONFIG = Object.assign({}, existingConfig, {
    /**
     * URL de l’API AfricaMenu.
     * Laisser vide (ou ne pas définir) si l’API est sur le même domaine via reverse proxy.
     * Sinon, ex. https://api.votredomaine.com (sans slash final).
     */
    API_URL: existingConfig.API_URL || defaultApiUrl,
    SUPPORT_EMAIL:
      typeof existingConfig.SUPPORT_EMAIL === "string" ? existingConfig.SUPPORT_EMAIL : "",
    /** Numéro WhatsApp du support plateforme (administration / abonnements). Chiffres internationaux sans +. */
    SUPPORT_WHATSAPP:
      typeof existingConfig.SUPPORT_WHATSAPP === "string" && existingConfig.SUPPORT_WHATSAPP.trim() !== "" ?
        existingConfig.SUPPORT_WHATSAPP
      : "22399421206",
    /**
     * URL publique du site (sans slash final) pour QR code et liens menu.
     * Laisser vide en production : window.location.origin sera utilisé.
     * En dev local uniquement : ex. http://192.168.1.12:5500 pour tester le scan QR depuis un téléphone.
     */
    PUBLIC_SITE_ORIGIN:
      typeof existingConfig.PUBLIC_SITE_ORIGIN === "string" ? existingConfig.PUBLIC_SITE_ORIGIN : "https://africamenu.com",
  });
})();
