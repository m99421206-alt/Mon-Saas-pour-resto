/**
 * Garde d’accès des pages administration plateforme.
 * — Non connecté → login.html
 * — Connecté sans droits admin → dashboard.html (restaurant)
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
    return String((window.MenuGo_CONFIG || {}).API_URL || "").replace(/\/$/, "");
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

  /**
   * Vérifie la session et le rôle admin avant d’afficher une page admin.
   * @param {{ loginNext?: string }} options
   * @returns {Promise<boolean>}
   */
  async function enforceAdminAccess(options) {
    var opts = options || {};
    var loginNext = opts.loginNext || getCurrentPage();

    /* 1. JWT présent en localStorage ? */
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
      redirectToRestaurantDashboard();
      return false;
    }

    /* 2. Vérification serveur : is_platform_admin (ADMIN_EMAILS côté API). */
    var response = await fetch(base + "/api/me", {
      headers: { Authorization: "Bearer " + token },
    });
    var data = await readJson(response);

    if (response.status === 401) {
      clearSession();
      redirectToLogin(loginNext);
      return false;
    }

    /* 3. Utilisateur connecté mais sans rôle administrateur plateforme. */
    if (!data.is_platform_admin) {
      redirectToRestaurantDashboard();
      return false;
    }

    return true;
  }

  /**
   * Réponses API admin : 401 → login, 403 → dashboard restaurant (pas de bannière).
   * @returns {boolean} true si une redirection a été déclenchée
   */
  function handleAdminApiStatus(status, options) {
    var loginNext = (options && options.loginNext) || getCurrentPage();

    if (status === 401) {
      clearSession();
      redirectToLogin(loginNext);
      return true;
    }

    if (status === 403) {
      redirectToRestaurantDashboard();
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
    clearSession: clearSession,
    redirectToLogin: redirectToLogin,
    redirectToRestaurantDashboard: redirectToRestaurantDashboard,
  };
})();
