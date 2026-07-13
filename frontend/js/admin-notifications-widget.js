/**
 * Widget cloche notifications — toutes les pages admin.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var POLL_MS = 45000;

  function getApiBase() {
    return String((window.MenuGo_CONFIG || {}).API_URL || "").replace(
      /\/$/,
      "",
    );
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateTime(iso) {
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

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function updateBadge(count) {
    var badge = document.getElementById("adm-notif-badge");
    if (!badge) {
      return;
    }
    var n = Math.max(0, Number(count) || 0);
    if (n <= 0) {
      badge.hidden = true;
      badge.textContent = "0";
      return;
    }
    badge.hidden = false;
    badge.textContent = n > 99 ? "99+" : String(n);
  }

  async function fetchRecent(token) {
    var base = getApiBase();
    if (!base || !token) {
      return null;
    }
    try {
      var p = "/api/admin/notifications/recent?limit=8";
      if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
        p = p.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
      var res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      });
      if (!res.ok) {
        return null;
      }
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function markRead(id, token) {
    var base = getApiBase();
    if (!base || !token || !id) {
      return null;
    }
    try {
      var p = "/api/admin/notifications/" + encodeURIComponent(id) + "/read";
      if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
        p = p.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
      var res = await fetch(url, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      });
      if (!res.ok) {
        return null;
      }
      return await res.json();
    } catch (e) {
      return null;
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
      var min = Math.floor(diffMs / 60000);
      if (min < 1) {
        return "à l'instant";
      }
      if (min < 60) {
        return "il y a " + min + " min";
      }
      var hrs = Math.floor(min / 60);
      if (hrs < 24) {
        return "il y a " + hrs + " h";
      }
      return formatDateTime(iso);
    } catch (e) {
      return formatDateTime(iso);
    }
  }

  function renderPanel(items) {
    var panel = document.getElementById("adm-notif-panel");
    if (!panel) {
      return;
    }

    if (!items.length) {
      panel.innerHTML =
        '<div class="adm-notif-panel__head"><h2>Notifications</h2>' +
        '<a class="adm-notif-panel__all" href="admin-notifications.html">Voir tout</a></div>' +
        '<p class="adm-notif-panel__empty">Aucune notification.</p>';
      return;
    }

    var listHtml = items
      .map(function (n) {
        var unreadCls = n.is_read ? "" : " is-unread";
        var count = Math.max(1, Number(n.group_count) || 1);
        var showBadge = Boolean(n.is_grouped) || count > 1;
        var summary = n.detail || n.last_message || "";
        if (showBadge && n.last_message) {
          summary =
            count +
            " demande" +
            (count > 1 ? "s" : "") +
            " — " +
            n.last_message;
        }
        return (
          '<li class="adm-notif-panel__item">' +
          '<button type="button" class="adm-notif-panel__link' +
          unreadCls +
          '" data-notif-id="' +
          escapeHtml(n.id) +
          '" data-notif-link="' +
          escapeHtml(n.link_url || "admin-notifications.html") +
          '">' +
          '<span class="adm-notif-panel__type">' +
          (showBadge
            ? '<span class="adm-notif-panel__count">[' +
              escapeHtml(String(count)) +
              "]</span> "
            : "") +
          escapeHtml(n.type_label) +
          "</span>" +
          '<span class="adm-notif-panel__resto">' +
          escapeHtml(n.restaurant_name) +
          "</span>" +
          (summary
            ? '<span class="adm-notif-panel__summary">' +
              escapeHtml(summary) +
              "</span>"
            : "") +
          '<span class="adm-notif-panel__time">' +
          escapeHtml(formatRelativeTime(n.at)) +
          "</span>" +
          "</button></li>"
        );
      })
      .join("");

    panel.innerHTML =
      '<div class="adm-notif-panel__head"><h2>Notifications</h2>' +
      '<a class="adm-notif-panel__all" href="admin-notifications.html">Voir tout</a></div>' +
      '<ul class="adm-notif-panel__list">' +
      listHtml +
      "</ul>";

    panel.querySelectorAll("[data-notif-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        handleNotificationClick(btn);
      });
    });
  }

  async function handleNotificationClick(btn) {
    var token = getToken();
    var id = btn.getAttribute("data-notif-id");
    var link =
      btn.getAttribute("data-notif-link") || "admin-notifications.html";
    if (token && id) {
      var result = await markRead(id, token);
      if (result && typeof result.unread_count === "number") {
        updateBadge(result.unread_count);
      } else {
        refreshBadge();
      }
    }
    window.location.href = safeAppUrl(link, "admin-notifications.html");
  }

  async function refreshBadge() {
    var token = getToken();
    if (!token) {
      updateBadge(0);
      return;
    }
    var data = await fetchRecent(token);
    if (!data) {
      return;
    }
    updateBadge(data.unread_count);
    if (panelOpen) {
      renderPanel(Array.isArray(data.notifications) ? data.notifications : []);
    }
  }

  var panelOpen = false;

  function setPanelOpen(open) {
    panelOpen = open;
    var panel = document.getElementById("adm-notif-panel");
    var btn = document.getElementById("adm-notifications");
    if (panel) {
      panel.hidden = !open;
      panel.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  async function togglePanel() {
    var token = getToken();
    if (!token) {
      return;
    }
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    var data = await fetchRecent(token);
    if (data) {
      updateBadge(data.unread_count);
      renderPanel(Array.isArray(data.notifications) ? data.notifications : []);
    }
    setPanelOpen(true);
  }

  function ensurePanel() {
    var wrap = document.getElementById("adm-notif-wrap");
    if (!wrap) {
      var btn = document.getElementById("adm-notifications");
      if (!btn || !btn.parentNode) {
        return;
      }
      wrap = document.createElement("div");
      wrap.className = "adm-notif-wrap";
      wrap.id = "adm-notif-wrap";
      btn.parentNode.insertBefore(wrap, btn);
      wrap.appendChild(btn);
    }
    if (!document.getElementById("adm-notif-panel")) {
      var panel = document.createElement("div");
      panel.id = "adm-notif-panel";
      panel.className = "adm-notif-panel";
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-hidden", "true");
      panel.hidden = true;
      wrap.appendChild(panel);
    }
  }

  function upgradeButton() {
    var btn = document.getElementById("adm-notifications");
    if (!btn) {
      var legacy = document.querySelector(
        '.adm-header__actions button[aria-label="Notifications"]',
      );
      if (legacy) {
        legacy.id = "adm-notifications";
        btn = legacy;
      }
    }
    if (!btn) {
      return;
    }

    btn.classList.add("adm-notif-btn");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-controls", "adm-notif-panel");
    btn.setAttribute("aria-expanded", "false");

    if (!btn.querySelector(".adm-notif-btn__icon")) {
      btn.innerHTML =
        '<svg class="adm-notif-btn__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0" />' +
        "</svg>" +
        '<span class="adm-notif-badge" id="adm-notif-badge" hidden>0</span>';
    }
  }

  function init() {
    if (!document.body.classList.contains("adm-app")) {
      return;
    }
    upgradeButton();
    ensurePanel();

    var btn = document.getElementById("adm-notifications");
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        togglePanel();
      });
    }

    document.addEventListener("click", function (e) {
      var wrap = document.getElementById("adm-notif-wrap");
      if (panelOpen && wrap && !wrap.contains(e.target)) {
        setPanelOpen(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panelOpen) {
        setPanelOpen(false);
      }
    });

    refreshBadge();
    window.setInterval(refreshBadge, POLL_MS);

    window.MenuGo_AdminNotif = {
      refresh: refreshBadge,
      updateBadge: updateBadge,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
