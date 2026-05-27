/**
 * Admin dashboard — shell UI + stats / activité (API uniquement si connecté).
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";
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
    var cfg = window.MenuGo_CONFIG || {};
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

  async function fetchAdminPost(path, token) {
    var base = getApiBase();
    if (!base || !token) {
      return { ok: false, status: 0, data: null };
    }
    try {
      var response = await fetch(base + path, {
        method: "POST",
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

  function waDigits(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  function buildRestaurantWaUrl(digits, restaurantName) {
    if (!digits) return "#";
    var msg =
      "Bonjour, nous vous contactons concernant votre demande d’installation MenuGo pour : " +
      String(restaurantName || "votre restaurant") +
      ".";
    return "https://wa.me/" + digits.replace(/^0+/, "") + "?text=" + encodeURIComponent(msg);
  }

  function renderSetupHelpRows(items, forbidden) {
    var tbody = document.getElementById("adm-setup-help-body");
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";

    if (forbidden) {
      var tr0 = document.createElement("tr");
      tr0.className = "adm-table__placeholder";
      tr0.innerHTML =
        "<td colspan=\"5\">Liste réservée aux administrateurs (variable ADMIN_EMAILS sur le serveur).</td>";
      tbody.appendChild(tr0);
      return;
    }

    if (!items || !items.length) {
      var trE = document.createElement("tr");
      trE.className = "adm-table__placeholder";
      trE.innerHTML = "<td colspan=\"5\">Aucune demande d’assistance en cours.</td>";
      tbody.appendChild(trE);
      return;
    }

    items.forEach(function (row) {
      var tr = document.createElement("tr");
      var digits = waDigits(row.phone);
      var waUrl = buildRestaurantWaUrl(digits, row.name);
      var nameCell = escapeHtml(row.name || "—");
      var emailCell = escapeHtml(row.email || "—");
      var phoneCell = escapeHtml(row.phone || "—");
      var dateCell =
        row.created_at ? escapeHtml(formatActivityDate(row.created_at)) : "—";

      var actionsHtml =
        '<div class="adm-setup-actions">' +
        '<a class="adm-mini-btn adm-mini-btn--wa"' +
        (waUrl === "#" ?
          ' href="#" role="button" aria-disabled="true"'
        : ' href="' + waUrl + '" target="_blank" rel="noopener noreferrer"') +
        '>Contacter<br /><span class="adm-mini-btn__hint">WhatsApp resto</span></a>' +
        '<button type="button" class="adm-mini-btn adm-mini-btn--done" data-setup-done="' +
        escapeHtml(String(Number(row.id) || "")) +
        "\">Installation<br /><span class=\"adm-mini-btn__hint\">terminée</span></button>" +
        "</div>";

      tr.innerHTML =
        "<td>" +
        nameCell +
        "</td><td>" +
        emailCell +
        "</td><td>" +
        phoneCell +
        "</td><td>" +
        dateCell +
        "</td><td>" +
        actionsHtml +
        "</td>";
      tbody.appendChild(tr);
    });
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
      renderSetupHelpRows([], true);
      return;
    }
    var statsData = statsRes.data || {};
    if (statsRes.ok && Number.isFinite(Number(statsData.total_users))) {
      applyStats({
        total_users: Number(statsData.total_users),
        active_restaurants: Number(statsData.active_restaurants),
        new_signups: Number(statsData.new_signups),
        active_subscriptions: Number(statsData.active_subscriptions),
        estimated_revenue_cfa: Number(statsData.estimated_revenue_cfa),
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
      renderSetupHelpRows([], true);
      return;
    }

    if (actRes.ok && actRes.data && Array.isArray(actRes.data.items)) {
      renderActivity(actRes.data.items.length ? actRes.data.items : []);
    } else {
      renderActivity([]);
      if (statsRes.ok && Number.isFinite(Number(statsData.total_users))) {
        showAccessBanner(
          "L’historique d’activité n’a pas pu être chargé.",
          "error",
        );
      }
    }

    var setupRes = await fetchAdminJson("/api/admin/setup-help?pageSize=50", token);
    if (setupRes.status === 401) {
      clearSessionAndRedirectLogin();
      return;
    }
    if (setupRes.status === 403) {
      renderSetupHelpRows([], true);
    } else if (setupRes.ok && setupRes.data && Array.isArray(setupRes.data.items)) {
      renderSetupHelpRows(setupRes.data.items, false);
    } else {
      renderSetupHelpRows([], false);
    }
  }

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

  function bindSetupHelpDelegation() {
    var tbody = document.getElementById("adm-setup-help-body");
    if (!tbody || tbody.dataset.delegBound === "1") {
      return;
    }
    tbody.dataset.delegBound = "1";
    tbody.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-setup-done]");
      if (!btn || btn.disabled) {
        return;
      }
      var id = btn.getAttribute("data-setup-done");
      if (!id || !/^-?\d+$/.test(id)) {
        return;
      }
      if (!confirm("Marquer l’installation de ce restaurant comme terminée ?")) {
        return;
      }
      var token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        clearSessionAndRedirectLogin();
        return;
      }

      btn.disabled = true;

      fetchAdminPost("/api/admin/restaurants/" + id + "/setup-help/complete", token).then(
        function (res) {
          if (res.status === 401) {
            clearSessionAndRedirectLogin();
            return;
          }
          if (!res.ok) {
            btn.disabled = false;
            alert((res.data && res.data.message) || "Impossible de mettre à jour.");
            return;
          }
          return fetchAdminJson("/api/admin/setup-help?pageSize=50", token);
        },
      ).then(function (refRes) {
        if (!refRes) {
          return;
        }
        if (refRes.status === 401) {
          clearSessionAndRedirectLogin();
          return;
        }
        if (refRes.ok && refRes.data && Array.isArray(refRes.data.items)) {
          renderSetupHelpRows(refRes.data.items, false);
        } else {
          renderSetupHelpRows([], false);
        }
      });
    });
  }

  function init() {
    if (!requireAuthToken()) {
      return;
    }
    bindSetupHelpDelegation();
    initShell();
    loadDashboardData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
