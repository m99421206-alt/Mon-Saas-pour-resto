/**
 * Garde d’accès des pages administration plateforme.
 * — Non connecté → login.html
 * — Connecté sans droits admin → dashboard.html (restaurant)
 * — Erreur réseau / serveur → bannière sur place (pas de fausse redirection)
 * — Admin plateforme → accès autorisé
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";
  var LOGIN_PAGE = "login.html";
  var RESTAURANT_DASHBOARD = "dashboard.html";

  function getApiBase() {
    return String((window.MenuGo_CONFIG || {}).API_URL || "").replace(
      /\/$/,
      "",
    );
  }

  function getCurrentPage() {
    var path = window.location.pathname || "";
    var name = path.split("/").pop();
    return name || "admin-dashboard.html";
  }

  function redirectToLogin(nextPage) {
    var next = nextPage || getCurrentPage();
    window.location.replace(LOGIN_PAGE + "?next=" + encodeURIComponent(next));
  }

  function redirectToRestaurantDashboard() {
    window.location.replace(RESTAURANT_DASHBOARD);
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(RESTAURANT_KEY);
    } catch (e) {}
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (e) {
      return {};
    }
  }

  function isTruthyAdminFlag(value) {
    return value === true || value === 1 || value === "1";
  }

  function hideAccessBanner() {
    var el = document.getElementById("adm-access-banner");
    if (!el) {
      return;
    }
    el.textContent = "";
    el.hidden = true;
    el.classList.remove("adm-banner--warning", "adm-banner--error");
  }

  function showAccessBanner(message, variant) {
    var el = document.getElementById("adm-access-banner");
    if (!el) {
      return;
    }
    el.textContent = message || "";
    el.hidden = false;
    el.classList.remove("adm-banner--warning", "adm-banner--error");
    el.classList.add(
      variant === "error" ? "adm-banner--error" : "adm-banner--warning",
    );
  }

  function buildMeUrl(base) {
    var p = "/api/me";
    if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
      p = p.replace(/^\/api/, "");
    }
    return String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
  }

  function isSuspendedAccountMessage(message) {
    return /suspendu/i.test(String(message || ""));
  }

  /**
   * Vérifie la session et le rôle admin avant d’afficher une page admin.
   * @param {{ loginNext?: string }} options
   * @returns {Promise<boolean>}
   */
  async function enforceAdminAccess(options) {
    var opts = options || {};
    var loginNext = opts.loginNext || getCurrentPage();

    var token;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      token = null;
    }
    if (!token) {
      redirectToLogin(loginNext);
      return false;
    }

    var base = getApiBase();
    if (!base) {
      showAccessBanner(
        "Configuration API manquante. Vérifiez frontend/js/config.js (API_URL).",
        "error",
      );
      return false;
    }

    var response;
    var data = {};

    try {
      response = await fetch(buildMeUrl(base), {
        headers: { Authorization: "Bearer " + token },
      });
      data = await readJson(response);
    } catch (err) {
      showAccessBanner(
        "Impossible de joindre l’API. Vérifiez votre connexion et frontend/js/config.js (API_URL).",
        "error",
      );
      return false;
    }

    if (response.status === 401) {
      clearSession();
      redirectToLogin(loginNext);
      return false;
    }

    if (response.status === 403) {
      var forbiddenMessage = data.message ? String(data.message).trim() : "";
      if (isSuspendedAccountMessage(forbiddenMessage)) {
        clearSession();
        redirectToLogin(loginNext);
        return false;
      }
      redirectToRestaurantDashboard();
      return false;
    }

    if (response.status === 503) {
      showAccessBanner(
        (data.message && String(data.message).trim()) ||
          "Administration temporairement indisponible. Réessayez plus tard.",
        "error",
      );
      return false;
    }

    if (response.status >= 500) {
      showAccessBanner(
        (data.message && String(data.message).trim()) ||
          "Erreur serveur lors de la vérification de l’accès administrateur.",
        "error",
      );
      return false;
    }

    if (!response.ok) {
      showAccessBanner(
        (data.message && String(data.message).trim()) ||
          "Impossible de vérifier l’accès administrateur.",
        "error",
      );
      return false;
    }

    if (!isTruthyAdminFlag(data.is_platform_admin)) {
      redirectToRestaurantDashboard();
      return false;
    }

    hideAccessBanner();
    return true;
  }

  /**
   * Réponses API admin : 401 → login, 403 → dashboard restaurant,
   * 503/5xx → bannière (reste sur la page).
   * @returns {boolean} true si le chargement doit s’arrêter
   */
  function handleAdminApiStatus(status, options) {
    var opts = options || {};
    var loginNext = opts.loginNext || getCurrentPage();
    var message = opts.message ? String(opts.message).trim() : "";

    if (status === 401) {
      clearSession();
      redirectToLogin(loginNext);
      return true;
    }

    if (status === 403) {
      if (isSuspendedAccountMessage(message)) {
        clearSession();
        redirectToLogin(loginNext);
        return true;
      }
      redirectToRestaurantDashboard();
      return true;
    }

    if (status === 503 || status >= 500) {
      showAccessBanner(
        message ||
          "Service administrateur temporairement indisponible. Réessayez plus tard.",
        "error",
      );
      return true;
    }

    return false;
  }

  window.MenuGo_AdminGuard = {
    TOKEN_KEY: TOKEN_KEY,
    USER_KEY: USER_KEY,
    RESTAURANT_KEY: RESTAURANT_KEY,
    enforceAdminAccess: enforceAdminAccess,
    handleAdminApiStatus: handleAdminApiStatus,
    showAccessBanner: showAccessBanner,
    hideAccessBanner: hideAccessBanner,
    clearSession: clearSession,
    redirectToLogin: redirectToLogin,
    redirectToRestaurantDashboard: redirectToRestaurantDashboard,
  };
})();
