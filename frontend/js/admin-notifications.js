/**
 * Admin — page Notifications (liste, filtres, actions).
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var LOGIN_NEXT = "admin-notifications.html";
  var PAGE_SIZE = 20;

  var state = { page: 1, filter: "all", total: 0, totalPages: 0, loading: false };

  function guardApiStatus(status) {
    return window.MenuGo_AdminGuard.handleAdminApiStatus(status, { loginNext: LOGIN_NEXT });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getApiBase() {
    return String((window.MenuGo_CONFIG || {}).API_URL || "").replace(/\/$/, "");
  }

  function formatDateTime(iso) {
    if (!iso) {
      return "—";
    }
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return "—";
    }
  }

  function showFeedback(msg, kind) {
    var el = document.getElementById("notif-feedback");
    if (!el) {
      return;
    }
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.remove("notif-feedback--ok", "notif-feedback--err");
    if (kind === "ok") {
      el.classList.add("notif-feedback--ok");
    }
    if (kind === "err") {
      el.classList.add("notif-feedback--err");
    }
  }

  async function apiFetch(method, path, token, body) {
    var base = getApiBase();
    var opts = {
      method: method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    try {
      var res = await fetch(base + path, opts);
      var data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      return { ok: res.ok, status: res.status, data: data };
    } catch (e) {
      return { ok: false, status: 0, data: null };
    }
  }

  function setFilterActive(filter) {
    document.querySelectorAll(".notif-filter").forEach(function (btn) {
      var active = btn.getAttribute("data-filter") === filter;
      btn.classList.toggle("is-active", active);
    });
  }

  function renderList(items) {
    var list = document.getElementById("notif-list");
    if (!list) {
      return;
    }
    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML =
        '<li class="notif-item"><p class="notif-item__meta">Aucune notification pour ce filtre.</p></li>';
      return;
    }

    items.forEach(function (n) {
      var li = document.createElement("li");
      li.className = "notif-item" + (n.is_read ? "" : " is-unread");
      li.innerHTML =
        '<div class="notif-item__head">' +
        '<span class="notif-item__type">' +
        escapeHtml(n.type_label) +
        "</span>" +
        '<span class="notif-item__status ' +
        (n.is_read ? "notif-item__status--read" : "notif-item__status--unread") +
        '">' +
        (n.is_read ? "Lu" : "Non lu") +
        "</span></div>" +
        '<p class="notif-item__meta"><strong>Restaurant :</strong> ' +
        escapeHtml(n.restaurant_name) +
        "</p>" +
        (n.phone ?
          '<p class="notif-item__meta"><strong>Téléphone :</strong> ' + escapeHtml(n.phone) + "</p>"
        : "") +
        '<p class="notif-item__meta"><strong>Date :</strong> ' +
        escapeHtml(formatDateTime(n.at)) +
        "</p>" +
        (n.detail ?
          '<p class="notif-item__detail">' + escapeHtml(n.detail) + "</p>"
        : "") +
        '<div class="notif-item__actions">' +
        '<button type="button" class="notif-btn notif-btn--primary" data-open="' +
        escapeHtml(n.id) +
        '" data-link="' +
        escapeHtml(n.link_url || "admin-notifications.html") +
        '">Ouvrir</button>' +
        (!n.is_read ?
          '<button type="button" class="notif-btn" data-read="' + escapeHtml(n.id) + '">Marquer lue</button>'
        : "") +
        '<button type="button" class="notif-btn notif-btn--danger" data-delete="' +
        escapeHtml(n.id) +
        '">Supprimer</button>' +
        "</div>";
      list.appendChild(li);
    });

    list.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openNotification(btn.getAttribute("data-open"), btn.getAttribute("data-link"));
      });
    });
    list.querySelectorAll("[data-read]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        markOneRead(btn.getAttribute("data-read"));
      });
    });
    list.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteOne(btn.getAttribute("data-delete"));
      });
    });
  }

  function renderPagination() {
    var nav = document.getElementById("notif-pagination");
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
    info.className = "notif-pagination__info";
    info.textContent =
      "Page " + state.page + " sur " + state.totalPages + " — " + state.total + " notification(s)";
    nav.appendChild(info);

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "notif-btn";
    prev.textContent = "Précédent";
    prev.disabled = state.page <= 1 || state.loading;
    prev.addEventListener("click", function () {
      state.page -= 1;
      loadNotifications();
    });
    nav.appendChild(prev);

    var next = document.createElement("button");
    next.type = "button";
    next.className = "notif-btn";
    next.textContent = "Suivant";
    next.disabled = state.page >= state.totalPages || state.loading;
    next.addEventListener("click", function () {
      state.page += 1;
      loadNotifications();
    });
    nav.appendChild(next);
  }

  function syncWidgetBadge(count) {
    if (window.MenuGo_AdminNotif && window.MenuGo_AdminNotif.updateBadge) {
      window.MenuGo_AdminNotif.updateBadge(count);
    }
  }

  async function loadNotifications() {
    var token = localStorage.getItem(TOKEN_KEY);
    state.loading = true;
    renderPagination();

    var qs =
      "?page=" +
      encodeURIComponent(String(state.page)) +
      "&pageSize=" +
      PAGE_SIZE +
      "&filter=" +
      encodeURIComponent(state.filter);

    var res = await apiFetch("GET", "/api/admin/notifications" + qs, token);
    state.loading = false;

    if (guardApiStatus(res.status)) {
      return;
    }
    if (!res.ok || !res.data) {
      showFeedback("Impossible de charger les notifications.", "err");
      renderList([]);
      return;
    }

    state.total = Number(res.data.total) || 0;
    state.totalPages = Number(res.data.totalPages) || 0;
    syncWidgetBadge(res.data.unread_count);

    renderList(Array.isArray(res.data.notifications) ? res.data.notifications : []);
    renderPagination();
  }

  async function openNotification(id, link) {
    var token = localStorage.getItem(TOKEN_KEY);
    if (id) {
      var res = await apiFetch("PATCH", "/api/admin/notifications/" + encodeURIComponent(id) + "/read", token);
      if (res.ok && res.data) {
        syncWidgetBadge(res.data.unread_count);
      }
    }
    window.location.href = link || "admin-notifications.html";
  }

  async function markOneRead(id) {
    var token = localStorage.getItem(TOKEN_KEY);
    var res = await apiFetch("PATCH", "/api/admin/notifications/" + encodeURIComponent(id) + "/read", token);
    if (guardApiStatus(res.status)) {
      return;
    }
    if (!res.ok) {
      showFeedback("Action impossible.", "err");
      return;
    }
    showFeedback("Notification marquée comme lue.", "ok");
    syncWidgetBadge(res.data && res.data.unread_count);
    await loadNotifications();
  }

  async function markAllRead() {
    var token = localStorage.getItem(TOKEN_KEY);
    var res = await apiFetch("POST", "/api/admin/notifications/mark-all-read", token, {});
    if (guardApiStatus(res.status)) {
      return;
    }
    if (!res.ok) {
      showFeedback("Action impossible.", "err");
      return;
    }
    showFeedback("Toutes les notifications ont été marquées comme lues.", "ok");
    syncWidgetBadge(0);
    await loadNotifications();
  }

  async function deleteOne(id) {
    if (!confirm("Supprimer cette notification ?")) {
      return;
    }
    var token = localStorage.getItem(TOKEN_KEY);
    var res = await apiFetch("DELETE", "/api/admin/notifications/" + encodeURIComponent(id), token);
    if (guardApiStatus(res.status)) {
      return;
    }
    if (!res.ok) {
      showFeedback("Suppression impossible.", "err");
      return;
    }
    showFeedback("Notification supprimée.", "ok");
    syncWidgetBadge(res.data && res.data.unread_count);
    await loadNotifications();
  }

  function initShell() {
    var body = document.body;
    var sidebarBtn = document.getElementById("adm-open-sidebar");
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
    document.querySelectorAll(".notif-filter").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.getAttribute("data-filter") || "all";
        state.page = 1;
        setFilterActive(state.filter);
        loadNotifications();
      });
    });

    var markAllBtn = document.getElementById("notif-mark-all");
    if (markAllBtn) {
      markAllBtn.addEventListener("click", markAllRead);
    }
  }

  async function init() {
    var allowed = await window.MenuGo_AdminGuard.enforceAdminAccess({ loginNext: LOGIN_NEXT });
    if (!allowed) {
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var urlFilter = params.get("filter");
    if (urlFilter) {
      state.filter = urlFilter;
    }

    initShell();
    attachHandlers();
    setFilterActive(state.filter);
    await loadNotifications();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
