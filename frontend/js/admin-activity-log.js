/**
 * Admin — Journal d'activité (liste, filtres, export CSV, purge).
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var LOGIN_NEXT = "admin-activity-log.html";
  var PAGE_SIZE = 20;
  var DEBOUNCE_MS = 340;

  var state = {
    page: 1,
    q: "",
    filter: "all",
    total: 0,
    totalPages: 0,
    loading: false,
  };

  function guardApiStatus(status) {
    return window.MenuGo_AdminGuard.handleAdminApiStatus(status, { loginNext: LOGIN_NEXT });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getApiBase() {
    var cfg = window.MenuGo_CONFIG || {};
    return String(cfg.API_URL || "").replace(/\/$/, "");
  }

  function formatDateTime(iso) {
    if (!iso) {
      return "—";
    }
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium",
      });
    } catch (e) {
      return "—";
    }
  }

  function formatStatNumber(n) {
    return Math.round(Number(n) || 0).toLocaleString("fr-FR");
  }

  function badgeHtml(variant, label) {
    var v = variant || "neutral";
    return (
      '<span class="adm-log-badge adm-log-badge--' +
      escapeHtml(v) +
      '">' +
      escapeHtml(label || "Événement") +
      "</span>"
    );
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

  function showFeedback(message, kind) {
    var el = document.getElementById("actlog-feedback");
    if (!el) {
      return;
    }
    el.textContent = message || "";
    el.hidden = !message;
    el.classList.remove("actlog-feedback--ok", "actlog-feedback--err");
    if (kind === "ok") {
      el.classList.add("actlog-feedback--ok");
    }
    if (kind === "err") {
      el.classList.add("actlog-feedback--err");
    }
  }

  function applyStats(stats) {
    if (!stats) {
      return;
    }
    var map = {
      "actlog-stat-total": formatStatNumber(stats.total_logs),
      "actlog-stat-logins": formatStatNumber(stats.logins_today),
      "actlog-stat-failures": formatStatNumber(stats.login_failures_today),
      "actlog-stat-pwd": formatStatNumber(stats.password_resets),
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.textContent = map[id];
      }
    });
  }

  async function fetchJson(path, token) {
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

  function buildQueryParams(extra) {
    extra = extra || {};
    var params = new URLSearchParams();
    params.set("page", String(extra.page != null ? extra.page : state.page));
    params.set("pageSize", String(PAGE_SIZE));
    params.set("filter", state.filter || "all");
    if (state.q) {
      params.set("q", state.q);
    }
    return params.toString();
  }

  function modeBadgeHtml(mode, impersonation) {
    var label = mode || (impersonation ? "Impersonation" : "Normal");
    var variant = impersonation ? "password" : "neutral";
    return badgeHtml(variant, label);
  }

  function renderTableRows(logs) {
    var tbody = document.getElementById("actlog-body");
    var cards = document.getElementById("actlog-cards");
    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";
    if (cards) {
      cards.innerHTML = "";
    }

    if (!logs.length) {
      tbody.innerHTML =
        '<tr class="adm-table__placeholder"><td colspan="6">Aucun événement pour ces critères.</td></tr>';
      return;
    }

    logs.forEach(function (row) {
      var actor = row.actor || row.user || "—";
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(formatDateTime(row.at)) +
        "</td><td>" +
        escapeHtml(actor) +
        "</td><td>" +
        escapeHtml(row.restaurant) +
        "</td><td>" +
        modeBadgeHtml(row.mode, row.impersonation) +
        "</td><td>" +
        badgeHtml(row.badge, row.action_label) +
        "</td><td class=\"actlog-detail-cell\">" +
        escapeHtml(row.action) +
        "</td>";
      tbody.appendChild(tr);

      if (cards) {
        var li = document.createElement("li");
        li.className = "actlog-card";
        li.innerHTML =
          '<div class="actlog-card__head">' +
          badgeHtml(row.badge, row.action_label) +
          modeBadgeHtml(row.mode, row.impersonation) +
          '<time datetime="' +
          escapeHtml(row.at || "") +
          '">' +
          escapeHtml(formatDateTime(row.at)) +
          "</time></div>" +
          '<p class="actlog-card__meta"><strong>Effectué par :</strong> ' +
          escapeHtml(actor) +
          "</p>" +
          '<p class="actlog-card__meta"><strong>Restaurant :</strong> ' +
          escapeHtml(row.restaurant) +
          "</p>" +
          '<p class="actlog-card__meta"><strong>Mode :</strong> ' +
          escapeHtml(row.mode || (row.impersonation ? "Impersonation" : "Normal")) +
          "</p>" +
          '<p class="actlog-card__detail">' +
          escapeHtml(row.action) +
          "</p>";
        cards.appendChild(li);
      }
    });
  }

  function renderPagination() {
    var nav = document.getElementById("actlog-pagination");
    if (!nav) {
      return;
    }
    nav.innerHTML = "";

    if (state.totalPages <= 1) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;

    var info = document.createElement("p");
    info.className = "actlog-pagination__info";
    info.textContent =
      "Page " + state.page + " sur " + state.totalPages + " — " + state.total + " événement(s)";
    nav.appendChild(info);

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "actlog-btn actlog-btn--outline";
    prev.textContent = "Précédent";
    prev.disabled = state.page <= 1 || state.loading;
    prev.addEventListener("click", function () {
      if (state.page > 1) {
        state.page -= 1;
        loadLogs();
      }
    });
    nav.appendChild(prev);

    var next = document.createElement("button");
    next.type = "button";
    next.className = "actlog-btn actlog-btn--outline";
    next.textContent = "Suivant";
    next.disabled = state.page >= state.totalPages || state.loading;
    next.addEventListener("click", function () {
      if (state.page < state.totalPages) {
        state.page += 1;
        loadLogs();
      }
    });
    nav.appendChild(next);
  }

  function setFilterActive(filter) {
    document.querySelectorAll(".actlog-filter").forEach(function (btn) {
      var isActive = btn.getAttribute("data-filter") === filter;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  async function loadLogs() {
    var token = localStorage.getItem(TOKEN_KEY);
    state.loading = true;
    renderPagination();

    var res = await fetchJson("/api/admin/audit-logs?" + buildQueryParams(), token);
    state.loading = false;

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok || !res.data) {
      showAccessBanner(
        (res.data && res.data.message) || "Impossible de charger le journal d'activité.",
        "error",
      );
      renderTableRows([]);
      renderPagination();
      return;
    }

    hideAccessBanner();
    state.total = Number(res.data.total) || 0;
    state.totalPages = Number(res.data.totalPages) || 0;
    if (state.page > state.totalPages && state.totalPages > 0) {
      state.page = state.totalPages;
      return loadLogs();
    }

    applyStats(res.data.stats);
    renderTableRows(Array.isArray(res.data.logs) ? res.data.logs : []);
    renderPagination();
  }

  async function exportCsv() {
    var token = localStorage.getItem(TOKEN_KEY);
    var base = getApiBase();
    if (!base || !token) {
      showFeedback("Session expirée.", "err");
      return;
    }

    var params = new URLSearchParams();
    params.set("filter", state.filter || "all");
    if (state.q) {
      params.set("q", state.q);
    }

    try {
      var response = await fetch(base + "/api/admin/audit-logs/export?" + params.toString(), {
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      if (guardApiStatus(response.status)) {
        return;
      }

      if (!response.ok) {
        showFeedback("Export impossible.", "err");
        return;
      }

      var blob = await response.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "africamenu-journal.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showFeedback("Export CSV téléchargé.", "ok");
    } catch (err) {
      showFeedback("Export impossible.", "err");
    }
  }

  async function purgeOldLogs() {
    if (
      !confirm(
        "Supprimer définitivement les logs de plus de 90 jours ? Cette action est irréversible.",
      )
    ) {
      return;
    }

    var token = localStorage.getItem(TOKEN_KEY);
    var base = getApiBase();
    if (!base || !token) {
      showFeedback("Session expirée.", "err");
      return;
    }

    try {
      var response = await fetch(base + "/api/admin/audit-logs/purge", {
        method: "DELETE",
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

      if (guardApiStatus(response.status)) {
        return;
      }

      if (!response.ok) {
        showFeedback((data && data.message) || "Purge impossible.", "err");
        return;
      }

      showFeedback((data && data.message) || "Anciens logs supprimés.", "ok");
      state.page = 1;
      await loadLogs();
    } catch (err) {
      showFeedback("Purge impossible.", "err");
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

    if (sidebarBtn) {
      sidebarBtn.addEventListener("click", function () {
        setOpen(!body.classList.contains("adm-sidebar-open"));
      });
    }
    if (overlay) {
      overlay.addEventListener("click", function () {
        setOpen(false);
      });
    }
  }

  function attachHandlers() {
    var qInput = document.getElementById("actlog-q");
    var debounceTimer = null;

    if (qInput) {
      qInput.addEventListener("input", function () {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(function () {
          state.q = String(qInput.value || "").trim();
          state.page = 1;
          loadLogs();
        }, DEBOUNCE_MS);
      });
    }

    document.querySelectorAll(".actlog-filter").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-filter") || "all";
        state.filter = next;
        state.page = 1;
        setFilterActive(next);
        loadLogs();
      });
    });

    var exportBtn = document.getElementById("actlog-export");
    if (exportBtn) {
      exportBtn.addEventListener("click", exportCsv);
    }

    var purgeBtn = document.getElementById("actlog-purge");
    if (purgeBtn) {
      purgeBtn.addEventListener("click", purgeOldLogs);
    }
  }

  function toggleResponsiveView() {
    var tableWrap = document.querySelector(".actlog-table-wrap");
    var cards = document.getElementById("actlog-cards");
    if (!tableWrap || !cards) {
      return;
    }
    var mobile = window.matchMedia("(max-width: 899px)").matches;
    tableWrap.hidden = mobile;
    cards.hidden = !mobile;
  }

  async function init() {
    var allowed = await window.MenuGo_AdminGuard.enforceAdminAccess({ loginNext: LOGIN_NEXT });
    if (!allowed) {
      return;
    }
    if (!getApiBase()) {
      showAccessBanner("API_URL manquant dans config.js.", "error");
      return;
    }

    initShell();
    attachHandlers();
    setFilterActive(state.filter);
    toggleResponsiveView();
    window.addEventListener("resize", toggleResponsiveView);
    await loadLogs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
