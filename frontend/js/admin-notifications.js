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

  function safeAppUrl(url, fallback) {
    if (window.MenuGo_DomSafe && window.MenuGo_DomSafe.sanitizeAppUrl) {
      return window.MenuGo_DomSafe.sanitizeAppUrl(url, fallback);
    }
    var fb = fallback || "admin-notifications.html";
    var raw = String(url || "").trim();
    if (!raw || /^(javascript|data):/i.test(raw) || /^https?:/i.test(raw)) {
      return fb;
    }
    return raw;
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

  function formatRelativeTime(iso) {
    if (!iso) {
      return "—";
    }
    try {
      var then = new Date(iso).getTime();
      var diffMs = Date.now() - then;
      if (!Number.isFinite(diffMs)) {
        return formatDateTime(iso);
      }
      var sec = Math.floor(diffMs / 1000);
      if (sec < 45) {
        return "à l'instant";
      }
      var min = Math.floor(sec / 60);
      if (min < 60) {
        return "il y a " + min + " minute" + (min > 1 ? "s" : "");
      }
      var hrs = Math.floor(min / 60);
      if (hrs < 24) {
        return "il y a " + hrs + " heure" + (hrs > 1 ? "s" : "");
      }
      var days = Math.floor(hrs / 24);
      if (days < 7) {
        return "il y a " + days + " jour" + (days > 1 ? "s" : "");
      }
      return formatDateTime(iso);
    } catch (e) {
      return formatDateTime(iso);
    }
  }

  function buildNotificationBody(n) {
    var count = Math.max(1, Number(n.group_count) || 1);
    var isGrouped = Boolean(n.is_grouped) || count > 1;
    var html = "";

    if (isGrouped) {
      html +=
        '<p class="notif-item__meta notif-item__meta--grouped"><strong>' +
        escapeHtml(String(count)) +
        " nouvelle" +
        (count > 1 ? "s" : "") +
        " demande" +
        (count > 1 ? "s" : "") +
        "</strong></p>";
      if (n.last_message) {
        html +=
          '<p class="notif-item__meta"><strong>Dernière :</strong> ' +
          escapeHtml(n.last_message) +
          "</p>";
      }
      html +=
        '<p class="notif-item__meta"><strong>Dernière activité :</strong> ' +
        escapeHtml(formatRelativeTime(n.at)) +
        "</p>";
    } else {
      html +=
        '<p class="notif-item__meta"><strong>Date :</strong> ' +
        escapeHtml(formatDateTime(n.at)) +
        "</p>";
      if (n.detail) {
        html += '<p class="notif-item__detail">' + escapeHtml(n.detail) + "</p>";
      }
    }

    return html;
  }

  function ensureGroupModal() {
    var existing = document.getElementById("notif-group-modal");
    if (existing) {
      return existing;
    }
    var modal = document.createElement("div");
    modal.id = "notif-group-modal";
    modal.className = "notif-group-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="notif-group-modal__backdrop" data-close="1"></div>' +
      '<div class="notif-group-modal__panel" role="dialog" aria-modal="true" aria-labelledby="notif-group-modal-title">' +
      '<header class="notif-group-modal__head">' +
      '<h2 id="notif-group-modal-title">Demandes</h2>' +
      '<button type="button" class="notif-group-modal__close" data-close="1" aria-label="Fermer">×</button>' +
      "</header>" +
      '<ul class="notif-group-modal__list" id="notif-group-modal-list"></ul>' +
      '<footer class="notif-group-modal__foot">' +
      '<button type="button" class="notif-btn notif-btn--primary" id="notif-group-modal-open">Ouvrir la page</button>' +
      "</footer></div>";
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        modal.hidden = true;
      });
    });
    return modal;
  }

  function showGroupedModal(notification, link) {
    var modal = ensureGroupModal();
    var title = document.getElementById("notif-group-modal-title");
    var list = document.getElementById("notif-group-modal-list");
    var openBtn = document.getElementById("notif-group-modal-open");
    if (!title || !list || !openBtn) {
      window.location.href = safeAppUrl(link, "admin-notifications.html");
      return;
    }

    title.textContent =
      (notification.type_label || "Demandes") + " — " + (notification.restaurant_name || "—");
    list.innerHTML = "";

    var messages = Array.isArray(notification.grouped_messages) ? notification.grouped_messages : [];
    if (!messages.length && notification.detail) {
      messages = [{ message: notification.detail, at: notification.at }];
    }

    messages.forEach(function (item, idx) {
      var li = document.createElement("li");
      li.className = "notif-group-modal__item";
      li.innerHTML =
        '<p class="notif-group-modal__msg">' +
        escapeHtml(item.message || "—") +
        "</p>" +
        '<p class="notif-group-modal__time">' +
        escapeHtml(formatRelativeTime(item.at || notification.at)) +
        "</p>";
      list.appendChild(li);
    });

    openBtn.onclick = function () {
      modal.hidden = true;
      window.location.href = safeAppUrl(
        link || notification.link_url,
        "admin-notifications.html",
      );
    };

    modal.hidden = false;
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
      var count = Math.max(1, Number(n.group_count) || 1);
      var showBadge = Boolean(n.is_grouped) || count > 1;
      li.innerHTML =
        '<div class="notif-item__head">' +
        '<span class="notif-item__type">' +
        (showBadge ?
          '<span class="notif-item__count-badge" aria-label="' +
          escapeHtml(String(count)) +
          ' demandes">[' +
          escapeHtml(String(count)) +
          "]</span> "
        : "") +
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
        buildNotificationBody(n) +
        '<div class="notif-item__actions">' +
        '<button type="button" class="notif-btn notif-btn--primary" data-open="' +
        escapeHtml(n.id) +
        '" data-link="' +
        escapeHtml(n.link_url || "admin-notifications.html") +
        '" data-grouped="' +
        (showBadge ? "1" : "0") +
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
        openNotification(
          btn.getAttribute("data-open"),
          btn.getAttribute("data-link"),
          btn.getAttribute("data-grouped"),
        );
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

  async function openNotification(id, link, isGrouped) {
    var token = localStorage.getItem(TOKEN_KEY);
    var notification = null;

    if (id && token) {
      var detailRes = await apiFetch("GET", "/api/admin/notifications/" + encodeURIComponent(id), token);
      if (detailRes.ok && detailRes.data && detailRes.data.notification) {
        notification = detailRes.data.notification;
      }

      var res = await apiFetch("PATCH", "/api/admin/notifications/" + encodeURIComponent(id) + "/read", token);
      if (res.ok && res.data) {
        syncWidgetBadge(res.data.unread_count);
      }
    }

    if (notification && (isGrouped === "1" || notification.is_grouped) && notification.grouped_messages.length > 1) {
      showGroupedModal(notification, link);
      return;
    }

    window.location.href = safeAppUrl(link, "admin-notifications.html");
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
