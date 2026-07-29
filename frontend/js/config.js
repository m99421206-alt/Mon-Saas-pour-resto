/**
 * Configuration globale Frontend — MenuGo / AfricaMenu
 */
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

  // En local : http://localhost:4000/api
  // En production : https://africamenu.com/api (sans slash final)
  var defaultApiUrl = isLocalHost
    ? protocol + "//" + hostname + ":" + API_PORT + "/api"
    : protocol + "//" + hostname + "/api";

  // En local : http://localhost:4000/uploads
  // En production : https://africamenu.com/uploads
  var defaultUploadsUrl = isLocalHost
    ? protocol + "//" + hostname + ":" + API_PORT + "/uploads"
    : window.location.origin + "/uploads";

  var existingConfig = window.MenuGo_CONFIG || {};

  var cleanApiUrl = (existingConfig.API_URL || defaultApiUrl).replace(
    /\/+$/,
    "",
  );
  var cleanUploadsUrl = (
    existingConfig.UPLOADS_URL || defaultUploadsUrl
  ).replace(/\/+$/, "");

  window.MenuGo_CONFIG = Object.assign({}, existingConfig, {
    API_URL: cleanApiUrl,
    UPLOADS_URL: cleanUploadsUrl,
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
        ? existingConfig.PUBLIC_SITE_ORIGIN.replace(/\/+$/, "")
        : window.location.origin,
  });
})();
