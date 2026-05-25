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
    /** Numéro WhatsApp du support plateforme (vous, administration / abonnements). Forme internationale, chiffres seuls sans + dans l’URL wa.me — distinct du WhatsApp restaurant (commandes, Paramètres). */
    SUPPORT_WHATSAPP:
      typeof existingConfig.SUPPORT_WHATSAPP === "string" ? existingConfig.SUPPORT_WHATSAPP : "",
    /**
     * URL de base du site (sans slash final) telle qu’un téléphone sur le Wi‑Fi peut l’ouvrir.
     * Ex. http://192.168.1.12:5500 si Live Server ouvre le dossier depuis ce port sur votre PC.
     * Laissez vide pour utiliser window.location.origin (OK en prod ; KO pour scan mobile si vous êtes en 127.0.0.1).
     */
    PUBLIC_SITE_ORIGIN:"http://192.168.100.16:5500",
      
  });
})();
