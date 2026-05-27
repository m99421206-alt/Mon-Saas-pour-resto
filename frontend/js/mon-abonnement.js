/**
 * Page « Mon abonnement » — espace restaurant.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";

  /** @returns {HTMLElement|null} */
  function el(id) {
    return document.getElementById(id);
  }

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("MenuGo_user");
    localStorage.removeItem("MenuGo_restaurant");
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (e) {
      return {};
    }
  }

  /** @returns {Promise<object|null>} */
  async function apiGetMe(apiUrl) {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }
    var response = await fetch(apiUrl + "/api/me", {
      headers: { Authorization: "Bearer " + token },
    });
    var data = await readJson(response);
    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      return null;
    }
    if (!response.ok) {
      throw new Error(data.message || "Erreur API");
    }
    return data;
  }

  function fillDrawer(restaurantName, email) {
    var ar = el("dash-drawer-restaurant");
    var ae = el("dash-drawer-email");
    if (ar)
      ar.textContent =
        restaurantName && restaurantName.trim() ? restaurantName : "Nom du resto";
    if (ae) ae.textContent = email && email.trim() ? email : "email du resto";
  }

  async function run() {
    var root = el("subscription-root");
    var titleMain = el("mon-abonnement-page-title");
    var subtitle = el("mon-abonnement-page-sub");

    try {
      var apiUrl =
        window.MenuGo_CONFIG && window.MenuGo_CONFIG.API_URL ?
          window.MenuGo_CONFIG.API_URL
        : "";
      if (!root || !window.MenuGoRestaurantSubscription || !window.MenuGoRestaurantSubscription.renderInto) return;

      var me = await apiGetMe(apiUrl);
      if (!me) return;

      var user = me.user || {};
      var restaurant = me.restaurant || null;
      var rn = restaurant && restaurant.name ? restaurant.name : "";
      fillDrawer(rn, user.email || "");

      if (titleMain) {
        if (rn && String(rn).trim()) {
          var short = rn.length > 40 ? String(rn).trim().slice(0, 38) + "…" : String(rn).trim();
          titleMain.textContent = short + " — abonnement";
        } else {
          titleMain.textContent = "Mon abonnement";
        }
      }

      window.MenuGoRestaurantSubscription.renderInto(root, me);
    } catch (e) {
      if (titleMain) titleMain.textContent = "Impossible de charger votre abonnement";
      if (subtitle) {
        subtitle.hidden = false;
        subtitle.textContent =
          e && e.message ? String(e.message) : "Réessayez plus tard ou vérifiez votre connexion.";
      }
      if (root) {
        root.innerHTML =
          '<p class="dash-my-sub__muted" role="alert">Échec du chargement.</p>';
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  var logoutBtn = el("dashboard-logout");
  logoutBtn?.addEventListener("click", clearSession);
})();
