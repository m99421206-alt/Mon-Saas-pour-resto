/**
 * Admin dashboard — shell UI + stats / activité (API uniquement si connecté).
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";
  var LOGIN_NEXT = "admin-dashboard.html";

  function guardApiStatus(status) {
    return window.MenuGo_AdminGuard.handleAdminApiStatus(status, {
      loginNext: LOGIN_NEXT,
    });
  }

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
    window.location.replace(
      "login.html?next=" + encodeURIComponent(LOGIN_NEXT),
    );
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
    el.classList.add(
      variant === "error" ? "adm-banner--error" : "adm-banner--warning",
    );
  }

  function clearStatsDisplay() {
    [
      "total-users",
      "active-restaurants",
      "new-signups",
      "active-subscriptions",
      "estimated-revenue",
    ].forEach(function (key) {
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

  function badgeHtml(variant, label) {
    var v = variant || "neutral";
    var lbl = label || "Événement";
    return (
      '<span class="adm-log-badge adm-log-badge--' +
      escapeHtml(v) +
      '">' +
      escapeHtml(lbl) +
      "</span>"
    );
  }

  function renderActivity(rows) {
    var tbody = document.getElementById("adm-activity-body");
    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    var limited = rows.slice(0, 10);

    if (!limited.length) {
      var trEmpty = document.createElement("tr");
      trEmpty.className = "adm-table__placeholder";
      trEmpty.innerHTML =
        '<td colspan="5">Aucune activité récente pour le moment.</td>';
      tbody.appendChild(trEmpty);
      return;
    }

    limited.forEach(function (row) {
      var tr = document.createElement("tr");
      var typeBadge = badgeHtml(
        row.badge,
        row.action_label || row.action_code || "Événement",
      );
      var modeLabel =
        row.mode || (row.impersonation ? "Impersonation" : "Normal");
      var modeBadge = badgeHtml(
        row.impersonation ? "password" : "neutral",
        modeLabel,
      );
      tr.innerHTML =
        "<td>" +
        escapeHtml(row.actor || row.user) +
        "</td><td>" +
        modeBadge +
        "</td><td>" +
        typeBadge +
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
      var p = String(path || "");
      if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
        p = p.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
      var response = await fetch(url, {
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

  async function fetchAdminPatch(path, token, body) {
    var base = getApiBase();
    if (!base || !token) {
      return { ok: false, status: 0, data: null };
    }
    try {
      var p = String(path || "");
      if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
        p = p.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
      var response = await fetch(url, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(body || {}),
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
      var p = String(path || "");
      if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
        p = p.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
      var response = await fetch(url, {
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
      "Bonjour, nous vous contactons concernant votre demande d’installation AfricaMenu pour : " +
      String(restaurantName || "votre restaurant") +
      ".";
    return (
      "https://wa.me/" +
      digits.replace(/^0+/, "") +
      "?text=" +
      encodeURIComponent(msg)
    );
  }

  function formatDateShort(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return "—";
    }
  }

  function adminWatchUrgencyClass(daysRemaining) {
    var dr = Number(daysRemaining);
    if (!Number.isFinite(dr)) return "";
    if (dr <= 3) return "adm-sub-watch-row--red";
    if (dr <= 7) return "adm-sub-watch-row--orange";
    return "adm-sub-watch-row--yellow";
  }

  function buildAdminSubWatchWaUrl(
    restaurantName,
    endsAtIso,
    daysRemaining,
    phoneRaw,
  ) {
    var digits = waDigits(phoneRaw);
    if (!digits) return "#";
    var exp = formatDateShort(endsAtIso);
    var dr = Number(daysRemaining);
    var daysText = Number.isFinite(dr)
      ? dr === 0
        ? "aujourd’hui"
        : dr === 1
          ? "demain (1 jour)"
          : "dans " + dr + " jours"
      : "prochainement";
    var msg =
      "Bonjour " +
      String(restaurantName || "restaurant") +
      ",\n\n" +
      "Votre abonnement AfricaMenu expire le " +
      exp +
      " (" +
      daysText +
      ").\n\n" +
      "Souhaitez-vous renouveler votre accès ? Nous restons disponibles pour vous accompagner.\n\n" +
      "L’équipe AfricaMenu";
    return (
      "https://wa.me/" +
      digits.replace(/^0+/, "") +
      "?text=" +
      encodeURIComponent(msg)
    );
  }

  function renderSubWatchRows(items, forbidden) {
    var tbody = document.getElementById("adm-sub-watch-body");
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";

    if (forbidden) {
      var tr0 = document.createElement("tr");
      tr0.className = "adm-table__placeholder";
      tr0.innerHTML = '<td colspan="5">Données indisponibles.</td>';
      tbody.appendChild(tr0);
      return;
    }

    if (!items || !items.length) {
      var trE = document.createElement("tr");
      trE.className = "adm-table__placeholder";
      trE.innerHTML =
        '<td colspan="5">Aucun abonnement à surveiller dans les 3 prochains jours.</td>';
      tbody.appendChild(trE);
      return;
    }

    items.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.className = adminWatchUrgencyClass(row.days_remaining);

      var waUrl = buildAdminSubWatchWaUrl(
        row.name,
        row.subscription_ends_at,
        row.days_remaining,
        row.owner_phone,
      );

      var daysCell =
        row.days_remaining === null || row.days_remaining === undefined
          ? "—"
          : escapeHtml(String(row.days_remaining));

      var waBtn =
        '<a class="adm-mini-btn adm-mini-btn--wa"' +
        (waUrl === "#"
          ? ' href="#" role="button" aria-disabled="true" title="Numéro WhatsApp restaurant indisponible"'
          : ' href="' + waUrl + '" target="_blank" rel="noopener noreferrer"') +
        ">WhatsApp</a>";

      tr.innerHTML =
        "<td>" +
        escapeHtml(row.name || "—") +
        "</td><td>" +
        escapeHtml(row.subscription_plan_label || "—") +
        "</td><td>" +
        escapeHtml(formatDateShort(row.subscription_ends_at)) +
        "</td><td>" +
        daysCell +
        "</td><td>" +
        waBtn +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  function setupHelpPreviewStatusClass(status) {
    var st = String(status || "").toLowerCase();
    return "ir-status ir-status--" + st.replace(/[^a-z_]/g, "");
  }

  function formatRelativeActivity(iso) {
    if (!iso) return "—";
    try {
      var diff = Date.now() - new Date(iso).getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return "À l'instant";
      if (mins < 60) return "Il y a " + mins + " min";
      var hours = Math.floor(mins / 60);
      if (hours < 24) return "Il y a " + hours + " h";
      return formatDateShort(iso);
    } catch (e) {
      return "—";
    }
  }

  async function loadSetupHelpPreview() {
    var token = localStorage.getItem(TOKEN_KEY);
    var setupRes = await fetchAdminJson(
      "/api/admin/setup-help?pageSize=5&filter=active",
      token,
    );
    if (guardApiStatus(setupRes.status)) {
      renderSetupHelpPreview([], setupRes.status === 503);
      return;
    }
    if (setupRes.ok && setupRes.data && Array.isArray(setupRes.data.items)) {
      renderSetupHelpPreview(setupRes.data.items, false);
    } else {
      renderSetupHelpPreview([], setupRes.status === 503);
    }
  }

  function renderSetupHelpPreview(items, forbidden) {
    var tbody = document.getElementById("adm-setup-help-body");
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";

    if (forbidden) {
      var tr0 = document.createElement("tr");
      tr0.className = "adm-table__placeholder";
      tr0.innerHTML = '<td colspan="4">Données indisponibles.</td>';
      tbody.appendChild(tr0);
      return;
    }

    if (!items || !items.length) {
      var trE = document.createElement("tr");
      trE.className = "adm-table__placeholder";
      trE.innerHTML =
        '<td colspan="4">Aucune demande active. <a href="admin-installation-requests.html">Voir toutes les demandes</a></td>';
      tbody.appendChild(trE);
      return;
    }

    items.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.addEventListener("click", function () {
        window.location.href =
          "admin-installation-requests.html?id=" + encodeURIComponent(String(row.id));
      });
      var statusLabel = escapeHtml(row.status_label || row.status || "—");
      var statusClass = setupHelpPreviewStatusClass(row.status);
      tr.innerHTML =
        "<td>" +
        escapeHtml(row.restaurant_name || "—") +
        "</td><td>" +
        escapeHtml(row.contact_name || "—") +
        '</td><td><span class="' +
        statusClass +
        '">' +
        statusLabel +
        "</span></td><td>" +
        escapeHtml(formatRelativeActivity(row.last_activity_at)) +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  async function loadDashboardData() {
    hideAccessBanner();

    var token = localStorage.getItem(TOKEN_KEY);
    var base = getApiBase();
    var setupHelpPromise = loadSetupHelpPreview();

    if (!base) {
      showAccessBanner(
        "Impossible de joindre l’API : vérifiez la configuration (frontend/js/config.js — API_URL).",
        "error",
      );
      clearStatsDisplay();
      renderActivity([]);
      renderSubWatchRows([], true);
      await setupHelpPromise;
      return;
    }

    var statsRes = await fetchAdminJson("/api/admin/stats", token);

    if (guardApiStatus(statsRes.status)) {
      await setupHelpPromise;
      return;
    }

    if (statsRes.status === 404 && statsRes.data && statsRes.data.message) {
      showAccessBanner(statsRes.data.message, "error");
      clearStatsDisplay();
      renderActivity([]);
      renderSubWatchRows([], true);
      await setupHelpPromise;
      return;
    }

    if (statsRes.status === 503) {
      showAccessBanner(
        (statsRes.data && statsRes.data.message) ||
          "Administration temporairement indisponible (configuration serveur).",
        "error",
      );
      clearStatsDisplay();
      renderActivity([]);
      renderSubWatchRows([], true);
      await setupHelpPromise;
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
        (statsRes.data && statsRes.data.message) ||
          "Les statistiques plateforme n’ont pas pu être chargées (serveur injoignable ou erreur).",
        "error",
      );
      clearStatsDisplay();
    }

    var actRes = await fetchAdminJson("/api/admin/activity?limit=10", token);

    if (guardApiStatus(actRes.status)) {
      await setupHelpPromise;
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

    await setupHelpPromise;

    var watchRes = await fetchAdminJson(
      "/api/admin/subscriptions/expiring",
      token,
    );
    if (guardApiStatus(watchRes.status)) {
      return;
    } else if (
      watchRes.ok &&
      watchRes.data &&
      Array.isArray(watchRes.data.items)
    ) {
      renderSubWatchRows(watchRes.data.items, false);
    } else {
      renderSubWatchRows([], false);
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

  async function init() {
    var allowed = await window.MenuGo_AdminGuard.enforceAdminAccess({
      loginNext: LOGIN_NEXT,
    });
    if (!allowed) {
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
