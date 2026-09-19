/**
 * Badge « Demandes d'installation » — visible sur toutes les pages admin.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";

  function getApiBase() {
    return String((window.MenuGo_CONFIG || {}).API_URL || "").replace(/\/$/, "");
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function ensureBadge(link) {
    var badge = link.querySelector(".adm-sidebar__count");
    if (badge) {
      return badge;
    }
    badge = document.createElement("span");
    badge.className = "adm-sidebar__count";
    badge.hidden = true;
    badge.setAttribute("aria-label", "Demandes actives");
    link.appendChild(badge);
    return badge;
  }

  function updateBadge(count) {
    var link = document.querySelector(
      '.adm-sidebar__link[href="admin-installation-requests.html"]',
    );
    if (!link) {
      return;
    }
    var badge = ensureBadge(link);
    var n = Math.max(0, Number(count) || 0);
    if (n <= 0) {
      badge.hidden = true;
      badge.textContent = "0";
      return;
    }
    badge.hidden = false;
    badge.textContent = n > 99 ? "99+" : String(n);
  }

  async function refreshSetupHelpNavBadge() {
    var token = getToken();
    var base = getApiBase();
    if (!token || !base) {
      updateBadge(0);
      return;
    }

    try {
      var path = "/api/admin/setup-help/stats";
      if (String(base).endsWith("/api") && path.indexOf("/api") === 0) {
        path = path.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(path).replace(/^\//, "");
      var res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      });
      if (!res.ok) {
        return;
      }
      var stats = await res.json();
      var active =
        (Number(stats.new) || 0) +
        (Number(stats.in_progress) || 0) +
        (Number(stats.to_review) || 0);
      updateBadge(active);
    } catch (e) {
      /* ignore */
    }
  }

  function init() {
    refreshSetupHelpNavBadge();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
