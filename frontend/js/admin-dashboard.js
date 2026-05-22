/**
 * Admin dashboard — shell UI + stats / activité (API uniquement si connecté).
 */
(function () {
  "use strict";

  var TOKEN_KEY = "africamenu_token";
  var USER_KEY = "africamenu_user";
  var RESTAURANT_KEY = "africamenu_restaurant";
  var LOGIN_NEXT = "admin-dashboard.html";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatCFA(n) {
    var num = Math.round(Number(n) || 0);
    return num.toLocaleString("fr-FR") + " CFA";
  }

  function formatStatNumber(n) {
    return Math.round(Number(n) || 0).toLocaleString("fr-FR");
  }

  function formatActivityDate(iso) {
    if (!iso) {
      return "—";
    }
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch (e) {
      return "—";
    }
  }

  function getApiBase() {
    var cfg = window.AFRICAMENU_CONFIG || {};
    return String(cfg.API_URL || "").replace(/\/$/, "");
  }

  function redirectToLogin() {
    window.location.replace("login.html?next=" + encodeURIComponent(LOGIN_NEXT));
  }

  function clearSessionAndRedirectLogin() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(RESTAURANT_KEY);
    } catch (e) {}
    redirectToLogin();
  }

  function requireAuthToken() {
    try {
      if (!localStorage.getItem(TOKEN_KEY)) {
        redirectToLogin();
        return false;
      }
    } catch (e) {
      redirectToLogin();
      return false;
    }
    return true;
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
    el.classList.add(variant === "error" ? "adm-banner--error" : "adm-banner--warning");
  }

  function clearStatsDisplay() {
    ["total-users", "active-restaurants", "new-signups", "active-subscriptions", "estimated-revenue"].forEach(function (
      key,
    ) {
      var el = document.querySelector('[data-stat="' + key + '"]');
      if (el) {
        el.textContent = "—";
      }
    });
  }

  function applyStats(stats) {
    var map = {
      "total-users": formatStatNumber(stats.total_users),
      "active-restaurants": formatStatNumber(stats.active_restaurants),
      "new-signups": formatStatNumber(stats.new_signups),
      "active-subscriptions": formatStatNumber(stats.active_subscriptions),
      "estimated-revenue": formatCFA(stats.estimated_revenue_cfa),
    };

    Object.keys(map).forEach(function (key) {
      var el = document.querySelector('[data-stat="' + key + '"]');
      if (el) {
        el.textContent = map[key];
      }
    });
  }

  function renderActivity(rows) {
    var tbody = document.getElementById("adm-activity-body");
    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    if (!rows.length) {
      var trEmpty = document.createElement("tr");
      trEmpty.className = "adm-table__placeholder";
      trEmpty.innerHTML =
        '<td colspan="3">Aucune activité récente pour le moment.</td>';
      tbody.appendChild(trEmpty);
      return;
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(row.user) +
        "</td><td>" +
        escapeHtml(row.action) +
        "</td><td>" +
        escapeHtml(formatActivityDate(row.at)) +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  async function fetchAdminJson(path, token) {
    var base = getApiBase();
    if (!base || !token) {
      return { ok: false, status: 0, data: null };
    }

    try {
      var response = await fetch(base + path, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      });

      var data = null;
      try {
        data = await response.json();
      } catch (e) {
        data = null;
      }

      return { ok: response.ok, status: response.status, data: data };
    } catch (err) {
      return { ok: false, status: 0, data: null };
    }
  }

  async function loadDashboardData() {
    hideAccessBanner();

    var token = localStorage.getItem(TOKEN_KEY);
    var base = getApiBase();

    if (!base) {
      showAccessBanner(
        "Impossible de joindre l’API : vérifiez la configuration (frontend/js/config.js — API_URL).",
        "error",
      );
      clearStatsDisplay();
      renderActivity([]);
      return;
    }

    var statsRes = await fetchAdminJson("/api/admin/stats", token);

    if (statsRes.status === 401) {
      clearSessionAndRedirectLogin();
      return;
    }

    if (statsRes.status === 403) {
      showAccessBanner(
        (statsRes.data && statsRes.data.message) ||
          "Accès administration réservé. Ajoutez votre email dans ADMIN_EMAILS sur le serveur ou contactez un administrateur.",
        "warning",
      );
      clearStatsDisplay();
      renderActivity([]);
      return;
    }

    var d = statsRes.data || {};
    if (statsRes.ok && Number.isFinite(Number(d.total_users))) {
      applyStats({
        total_users: Number(d.total_users),
        active_restaurants: Number(d.active_restaurants),
        new_signups: Number(d.new_signups),
        active_subscriptions: Number(d.active_subscriptions),
        estimated_revenue_cfa: Number(d.estimated_revenue_cfa),
      });
    } else {
      showAccessBanner(
        "Les statistiques plateforme n’ont pas pu être chargées (serveur injoignable ou erreur).",
        "error",
      );
      clearStatsDisplay();
    }

    var actRes = await fetchAdminJson("/api/admin/activity", token);

    if (actRes.status === 401) {
      clearSessionAndRedirectLogin();
      return;
    }

    if (actRes.status === 403) {
      showAccessBanner(
        (actRes.data && actRes.data.message) ||
          "Accès administration réservé pour l’historique d’activité.",
        "warning",
      );
      renderActivity([]);
      return;
    }

    if (actRes.ok && actRes.data && Array.isArray(actRes.data.items)) {
      renderActivity(actRes.data.items.length ? actRes.data.items : []);
    } else {
      renderActivity([]);
      if (statsRes.ok && Number.isFinite(Number(d.total_users))) {
        showAccessBanner(
          "L’historique d’activité n’a pas pu être chargé.",
          "error",
        );
      }
    }
  }

  /* ---------- Shell sidebar / overlay ---------- */

  function initShell() {
    var body = document.body;
    var sidebarBtn = document.getElementById("adm-open-sidebar");
    var sidebar = document.getElementById("adm-sidebar-panel");
    var overlay = document.getElementById("adm-overlay");

    function setOpen(open) {
      body.classList.toggle("adm-sidebar-open", open);
      if (sidebarBtn) {
        sidebarBtn.setAttribute("aria-expanded", open ? "true" : "false");
      }
      if (overlay) {
        overlay.classList.toggle("is-visible", open);
        overlay.setAttribute("aria-hidden", open ? "false" : "true");
      }
    }

    function closeSidebar() {
      setOpen(false);
    }

    if (sidebarBtn && sidebar) {
      sidebarBtn.addEventListener("click", function () {
        setOpen(!body.classList.contains("adm-sidebar-open"));
      });
    }

    if (overlay) {
      overlay.addEventListener("click", closeSidebar);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeSidebar();
      }
    });

    window.addEventListener(
      "resize",
      function () {
        if (window.matchMedia("(min-width: 901px)").matches) {
          closeSidebar();
        }
      },
      { passive: true },
    );
  }

  function init() {
    if (!requireAuthToken()) {
      return;
    }
    initShell();
    loadDashboardData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
