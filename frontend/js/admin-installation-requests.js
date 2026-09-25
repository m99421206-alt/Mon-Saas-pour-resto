/**
 * Admin — Demandes d'installation (CRM)
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var LOGIN_NEXT = "admin-installation-requests.html";
  var INSTALLATION_PRICE_CFA = 35000;
  var searchTimer = null;
  var currentDetailId = null;
  var openMenuId = null;
  var menuCloseSuspended = false;

  var CHECKLIST_SECTIONS = {
    info: {
      title: "Informations",
      items: {
        restaurant_name: "Nom du restaurant",
        contact_name: "Nom du responsable",
        whatsapp: "WhatsApp",
        city: "Ville",
      },
    },
    received: {
      title: "Éléments reçus",
      items: {
        menu: "Menu",
        logo: "Logo",
        photos: "Photos",
        extra_info: "Informations complémentaires",
      },
    },
    config: {
      title: "Configuration",
      items: {
        restaurant_created: "Restaurant créé",
        account_created: "Compte créé",
        categories: "Catégories configurées",
        products: "Plats configurés",
        prices: "Prix vérifiés",
        photos_added: "Photos ajoutées",
        branding: "Identité visuelle configurée",
        whatsapp: "WhatsApp configuré",
        qr_code: "QR code généré",
      },
    },
    verification: {
      title: "Vérification",
      items: {
        mobile_test: "Menu testé sur téléphone",
        restaurant_verified: "Restaurant a vérifié le menu",
        corrections: "Corrections effectuées",
        installation_done: "Installation terminée",
      },
    },
  };

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

  function getApiBase() {
    var cfg = window.MenuGo_CONFIG || {};
    return String(cfg.API_URL || "").replace(/\/$/, "");
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  async function fetchJson(method, path, token, opts) {
    var base = getApiBase();
    if (!base) {
      return { ok: false, status: 0, data: null };
    }
    var headers = { Accept: "application/json" };
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    var init = { method: method, headers: headers, credentials: "same-origin" };
    if (opts && opts.body != null) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    try {
      var p = String(path || "");
      if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
        p = p.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
      var response = await fetch(url, init);
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

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "—";
    }
  }

  function formatCfa(amount, allowZero) {
    var value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      return "—";
    }
    if (value === 0 && !allowZero) {
      return "—";
    }
    return value.toLocaleString("fr-FR") + " F CFA";
  }

  function getCompletedRevenueCfa(row) {
    if (String(row.status || "").toLowerCase() !== "completed") {
      return null;
    }
    var amount = Number(row.revenue_cfa);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
    var stored = Number(row.installation_price_cfa);
    if (Number.isFinite(stored) && stored > 0) {
      return stored;
    }
    return INSTALLATION_PRICE_CFA;
  }

  function formatRevenueCell(row) {
    var amount = getCompletedRevenueCfa(row);
    if (amount == null) {
      return "—";
    }
    return formatCfa(amount);
  }

  function renderRevenueCellHtml(row) {
    var text = formatRevenueCell(row);
    if (String(row.status || "").toLowerCase() === "completed") {
      return '<span class="ir-revenue-cell__amount">' + escapeHtml(text) + "</span>";
    }
    return escapeHtml(text);
  }

  function formatRelative(iso) {
    if (!iso) return "—";
    try {
      var diff = Date.now() - new Date(iso).getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return "À l'instant";
      if (mins < 60) return "Il y a " + mins + " min";
      var hours = Math.floor(mins / 60);
      if (hours < 24) return "Il y a " + hours + " h";
      var days = Math.floor(hours / 24);
      if (days < 7) return "Il y a " + days + " j";
      return formatDateShort(iso);
    } catch (e) {
      return "—";
    }
  }

  function waDigits(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  function buildRestaurantWaUrl(digits, restaurantName) {
    if (!digits) return "#";
    var msg =
      "Bonjour, nous vous contactons concernant votre demande d'installation AfricaMenu pour : " +
      String(restaurantName || "votre restaurant") +
      ".";
    return (
      "https://wa.me/" +
      digits.replace(/^0+/, "") +
      "?text=" +
      encodeURIComponent(msg)
    );
  }

  function statusClass(status) {
    var st = String(status || "new").toLowerCase();
    return "ir-status ir-status--" + st.replace(/[^a-z_]/g, "");
  }

  function statusLabel(row) {
    return row.status_label || row.status || "—";
  }

  function getFilter() {
    var sel = document.getElementById("ir-filter");
    return sel ? String(sel.value || "active").trim() : "active";
  }

  function resolveRequestId(el) {
    if (!el) return null;
    var row = el.closest("[data-request-id]");
    if (row) {
      return row.getAttribute("data-request-id");
    }
    var dropdown = el.closest(".ir-dropdown");
    if (dropdown && dropdown.getAttribute("data-request-id")) {
      return dropdown.getAttribute("data-request-id");
    }
    var cell = el.closest(".ir-actions-cell, .ir-card-actions");
    if (cell) {
      var btn = cell.querySelector(".ir-menu-btn[data-menu]");
      if (btn) {
        return btn.getAttribute("data-menu");
      }
    }
    return null;
  }

  function getSearch() {
    var inp = document.getElementById("ir-search");
    return inp ? String(inp.value || "").trim() : "";
  }

  function clearMenuPlacement(dropdown) {
    if (!dropdown) return;
    if (dropdown._irHome && dropdown.parentNode !== dropdown._irHome) {
      dropdown._irHome.appendChild(dropdown);
    }
    dropdown._irHome = null;
    dropdown.style.position = "";
    dropdown.style.zIndex = "";
    dropdown.style.left = "";
    dropdown.style.top = "";
    dropdown.style.right = "";
  }

  function placeOpenMenu(dropdown, anchor) {
    if (!dropdown || !anchor) return;
    menuCloseSuspended = true;
    window.setTimeout(function () {
      menuCloseSuspended = false;
    }, 0);
    if (!dropdown._irHome) {
      dropdown._irHome = dropdown.parentNode;
    }
    if (dropdown.parentNode !== document.body) {
      document.body.appendChild(dropdown);
    }
    dropdown.style.position = "fixed";
    dropdown.style.zIndex = "400";
    dropdown.style.right = "auto";
    var rect = anchor.getBoundingClientRect();
    var margin = 8;
    var width = dropdown.offsetWidth || 210;
    var height = dropdown.offsetHeight || 0;
    var left = rect.right - width;
    if (left < margin) left = margin;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width);
    }
    var top = rect.bottom + 2;
    if (
      height &&
      top + height > window.innerHeight - margin &&
      rect.top - height - 2 >= margin
    ) {
      top = rect.top - height - 2;
    }
    dropdown.style.left = Math.round(left) + "px";
    dropdown.style.top = Math.round(top) + "px";
  }

  function closeAllMenus() {
    document.querySelectorAll(".ir-dropdown.is-open").forEach(function (el) {
      el.classList.remove("is-open");
      clearMenuPlacement(el);
    });
    document.querySelectorAll('.ir-menu-btn[aria-expanded="true"]').forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
    });
    openMenuId = null;
  }

  function getActionsForStatus(status, row) {
    var st = String(status || "new").toLowerCase();
    var actions = [];
    var digits = waDigits(row.phone);
    var waUrl = buildRestaurantWaUrl(digits, row.restaurant_name);

    if (st === "new") {
      actions.push({ type: "wa", label: "Contacter WhatsApp", href: waUrl });
      actions.push({ type: "status", label: "Marquer comme contacté", status: "contacted" });
      actions.push({ type: "status", label: "Annuler", status: "cancelled", confirm: "Annuler cette demande ?" });
    } else if (st === "contacted") {
      actions.push({ type: "status", label: "Informations reçues", status: "info_received" });
      actions.push({ type: "status", label: "Annuler", status: "cancelled", confirm: "Annuler cette demande ?" });
    } else if (st === "info_received") {
      actions.push({ type: "status", label: "Démarrer installation", status: "in_progress" });
      actions.push({ type: "status", label: "Annuler", status: "cancelled", confirm: "Annuler cette demande ?" });
    } else if (st === "in_progress") {
      actions.push({ type: "status", label: "Prêt à vérifier", status: "ready_to_review" });
      actions.push({ type: "status", label: "Annuler", status: "cancelled", confirm: "Annuler cette demande ?" });
    } else if (st === "ready_to_review") {
      actions.push({ type: "status", label: "Installation terminée", status: "completed", confirm: "Confirmer la fin de l'installation ?" });
      actions.push({ type: "status", label: "Demander correction", status: "correction_needed" });
    } else if (st === "correction_needed") {
      actions.push({ type: "status", label: "Reprendre installation", status: "in_progress" });
    } else if (st === "completed") {
      if (row.linked_restaurant_id) {
        actions.push({ type: "restaurant", label: "Voir restaurant", id: row.linked_restaurant_id });
      }
    } else if (st === "cancelled") {
      actions.push({ type: "reactivate", label: "Réactiver" });
    }

    actions.push({ type: "detail", label: "Ouvrir détails", sep: true });
    return actions;
  }

  function renderMenuHtml(row) {
    var actions = getActionsForStatus(row.status, row);
    var html =
      '<div class="ir-dropdown" data-request-id="' +
      row.id +
      '">';
    actions.forEach(function (act) {
      if (act.sep) {
        html += '<div class="ir-dropdown__sep"></div>';
      }
      if (act.type === "wa") {
        var disabled = !act.href || act.href === "#";
        html +=
          '<a href="' +
          (disabled ? "#" : escapeHtml(act.href)) +
          '"' +
          (disabled ? ' aria-disabled="true"' : ' target="_blank" rel="noopener noreferrer"') +
          ' data-action="wa">' +
          escapeHtml(act.label) +
          "</a>";
      } else if (act.type === "restaurant") {
        html +=
          '<a href="admin-restaurants.html?id=' +
          encodeURIComponent(String(act.id)) +
          '">' +
          escapeHtml(act.label) +
          "</a>";
      } else {
        html +=
          '<button type="button" data-action="' +
          escapeHtml(act.type) +
          '"';
        if (act.status) {
          html += ' data-status="' + escapeHtml(act.status) + '"';
        }
        if (act.confirm) {
          html += ' data-confirm="' + escapeHtml(act.confirm) + '"';
        }
        html += ">" + escapeHtml(act.label) + "</button>";
      }
    });
    html += "</div>";
    return html;
  }

  function renderTableRows(items, forbidden) {
    closeAllMenus();
    var tbody = document.getElementById("ir-table-body");
    var cards = document.getElementById("ir-cards-list");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (cards) cards.innerHTML = "";

    if (forbidden) {
      tbody.innerHTML =
        '<tr class="adm-table__placeholder"><td colspan="9">Données indisponibles.</td></tr>';
      return;
    }

    if (!items || !items.length) {
      tbody.innerHTML =
        '<tr class="adm-table__placeholder"><td colspan="9">Aucune demande pour ce filtre.</td></tr>';
      return;
    }

    items.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-request-id", String(row.id));

      tr.innerHTML =
        '<td class="ir-col-restaurant">' +
        escapeHtml(row.restaurant_name || "—") +
        '</td><td class="ir-col-contact">' +
        escapeHtml(row.contact_name || "—") +
        "</td><td>" +
        escapeHtml(row.phone || "—") +
        "</td><td>" +
        escapeHtml(row.city || "—") +
        '</td><td class="ir-col-date">' +
        escapeHtml(formatDateShort(row.created_at)) +
        '</td><td class="ir-col-status"><span class="' +
        statusClass(row.status) +
        '">' +
        escapeHtml(statusLabel(row)) +
        '</span></td><td class="ir-revenue-cell">' +
        renderRevenueCellHtml(row) +
        '</td><td class="ir-col-activity">' +
        escapeHtml(formatRelative(row.last_activity_at)) +
        '</td><td class="ir-actions-cell"><button type="button" class="ir-menu-btn" aria-label="Actions" aria-expanded="false" aria-haspopup="true" data-menu="' +
        row.id +
        '">⋮</button>' +
        renderMenuHtml(row) +
        "</td>";

      tbody.appendChild(tr);

      if (cards) {
        var li = document.createElement("li");
        li.className = "ir-card";
        li.setAttribute("data-request-id", String(row.id));
        li.innerHTML =
          '<div class="ir-card__head"><h3 class="ir-card__title">' +
          escapeHtml(row.restaurant_name || "—") +
          '</h3><span class="' +
          statusClass(row.status) +
          '">' +
          escapeHtml(statusLabel(row)) +
          "</span></div>" +
          (String(row.status || "").toLowerCase() === "completed" ?
            '<p class="ir-card__meta ir-card__meta--revenue"><strong>Revenu :</strong> ' +
              escapeHtml(formatRevenueCell(row)) +
              "</p>"
          : "") +
          '<p class="ir-card__meta">' +
          escapeHtml(row.contact_name || "—") +
          " · " +
          escapeHtml(row.phone || "—") +
          "</p>" +
          '<p class="ir-card__meta">' +
          escapeHtml(row.city || "—") +
          " · " +
          escapeHtml(formatDateShort(row.created_at)) +
          " · " +
          escapeHtml(formatRelative(row.last_activity_at)) +
          '</p><div class="ir-card-actions ir-actions-cell">' +
          '<button type="button" class="ir-menu-btn" aria-label="Actions" aria-expanded="false" aria-haspopup="true" data-menu="' +
          row.id +
          '">⋮</button>' +
          renderMenuHtml(row) +
          "</div>";
        cards.appendChild(li);
      }
    });
  }

  function renderKpi(stats) {
    var grid = document.getElementById("ir-kpi-grid");
    if (!grid) return;
    var s = stats || {};
    var cards = [
      { key: "new", label: "Nouvelles demandes" },
      { key: "to_contact", label: "À contacter" },
      { key: "in_progress", label: "Installations en cours" },
      { key: "to_review", label: "À vérifier" },
      { key: "completed", label: "Terminées" },
    ];
    grid.innerHTML = cards
      .map(function (c) {
        return (
          '<div class="ir-kpi-card"><span class="ir-kpi-card__label">' +
          escapeHtml(c.label) +
          '</span><span class="ir-kpi-card__value">' +
          escapeHtml(String(Number(s[c.key]) || 0)) +
          "</span></div>"
        );
      })
      .join("");
  }

  function renderRevenue(stats) {
    var panel = document.getElementById("ir-revenue-panel");
    if (!panel) return;
    var rev = stats && stats.revenue ? stats.revenue : {};
    var completedCount = Number(rev.completed_count) || Number(stats.completed) || 0;
    var unitPrice =
      Number(rev.price_per_installation_cfa) > 0 ?
        Number(rev.price_per_installation_cfa)
      : INSTALLATION_PRICE_CFA;
    var totalCfa =
      Number(rev.total_cfa) > 0 ? Number(rev.total_cfa) : completedCount * unitPrice;
    panel.innerHTML =
      '<h2 class="ir-revenue-panel__title">Revenus des installations</h2>' +
      '<div class="ir-revenue-panel__grid">' +
      '<div class="ir-revenue-panel__item"><span class="ir-revenue-panel__label">Installations terminées</span><span class="ir-revenue-panel__value">' +
      escapeHtml(String(completedCount)) +
      '</span></div><div class="ir-revenue-panel__item"><span class="ir-revenue-panel__label">Revenus générés</span><span class="ir-revenue-panel__value ir-revenue-panel__value--accent">' +
      escapeHtml(formatCfa(totalCfa, true)) +
      '</span></div><div class="ir-revenue-panel__item"><span class="ir-revenue-panel__label">Prix par installation</span><span class="ir-revenue-panel__value">' +
      escapeHtml(formatCfa(unitPrice)) +
      "</span></div></div>";
  }

  async function loadStats(token) {
    var res = await fetchJson("GET", "/api/admin/setup-help/stats", token);
    if (guardApiStatus(res.status)) return;
    if (res.ok && res.data) {
      renderKpi(res.data);
      renderRevenue(res.data);
    }
  }

  async function loadList(token) {
    var filter = getFilter();
    var q = getSearch();
    var qs =
      "?page=1&pageSize=100&filter=" +
      encodeURIComponent(filter) +
      (q ? "&q=" + encodeURIComponent(q) : "");
    var res = await fetchJson("GET", "/api/admin/setup-help" + qs, token);
    if (guardApiStatus(res.status)) return;
    if (res.ok && res.data && Array.isArray(res.data.items)) {
      renderTableRows(res.data.items, false);
    } else {
      renderTableRows([], res.status === 503);
    }
  }

  async function refreshAll() {
    var token = getToken();
    if (!token) return;
    await Promise.all([loadStats(token), loadList(token)]);
    if (currentDetailId) {
      await openDetail(currentDetailId, true);
    }
  }

  function setDetailModalOpen(open) {
    var modal = document.getElementById("ir-detail-modal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    if (!open) {
      currentDetailId = null;
    }
  }

  function setCreateModalOpen(open) {
    var modal = document.getElementById("ir-create-modal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function renderChecklistHtml(checklist, requestId) {
    var html = "";
    Object.keys(CHECKLIST_SECTIONS).forEach(function (sectionKey) {
      var section = CHECKLIST_SECTIONS[sectionKey];
      html += '<div class="ir-checklist-group"><h5>' + escapeHtml(section.title) + "</h5>";
      Object.keys(section.items).forEach(function (itemKey) {
        var checked =
          checklist &&
          checklist[sectionKey] &&
          checklist[sectionKey][itemKey] === true;
        var id = "ir-cl-" + requestId + "-" + sectionKey + "-" + itemKey;
        html +=
          '<label class="ir-checklist-item" for="' +
          id +
          '"><input type="checkbox" id="' +
          id +
          '" data-section="' +
          escapeHtml(sectionKey) +
          '" data-key="' +
          escapeHtml(itemKey) +
          '"' +
          (checked ? " checked" : "") +
          " /> " +
          escapeHtml(section.items[itemKey]) +
          "</label>";
      });
      html += "</div>";
    });
    return html;
  }

  function renderHistoryHtml(events) {
    if (!events || !events.length) {
      return '<p class="ir-card__meta">Aucun événement enregistré.</p>';
    }
    var sorted = events.slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    var html = '<ul class="ir-history">';
    sorted.forEach(function (ev) {
      var label = ev.event_label || ev.event_type || "Événement";
      var detail = ev.detail ? escapeHtml(ev.detail) : "";
      var admin =
        ev.admin_email ?
          '<div class="ir-history__admin">Par ' + escapeHtml(ev.admin_email) + "</div>"
        : "";
      if (ev.event_type === "status_changed" && ev.payload && ev.payload.from && ev.payload.to) {
        detail = escapeHtml(
          (ev.payload.from_label || ev.payload.from) +
            " → " +
            (ev.payload.to_label || ev.payload.to),
        );
      }
      html +=
        "<li><div class=\"ir-history__time\">" +
        escapeHtml(formatDateTime(ev.created_at)) +
        '</div><div class="ir-history__label">' +
        escapeHtml(label) +
        "</div>" +
        (detail ? '<div class="ir-history__detail">' + detail + "</div>" : "") +
        admin +
        "</li>";
    });
    html += "</ul>";
    return html;
  }

  function renderNotesHtml(notes) {
    if (!notes || !notes.length) {
      return "";
    }
    var html = '<ul class="ir-notes-list">';
    notes.forEach(function (note) {
      html +=
        "<li><div class=\"ir-notes-list__meta\">" +
        escapeHtml(formatDateTime(note.created_at)) +
        (note.admin_email ? " · " + escapeHtml(note.admin_email) : "") +
        "</div>" +
        escapeHtml(note.detail || "") +
        "</li>";
    });
    html += "</ul>";
    return html;
  }

  async function openDetail(id, silent) {
    var token = getToken();
    if (!token) return;
    var res = await fetchJson("GET", "/api/admin/setup-help/" + id, token);
    if (guardApiStatus(res.status)) return;
    if (!res.ok || !res.data || !res.data.request) {
      if (!silent) {
        alert((res.data && res.data.message) || "Impossible de charger la demande.");
      }
      return;
    }

    var req = res.data.request;
    currentDetailId = req.id;

    var titleEl = document.getElementById("ir-detail-title");
    var subEl = document.getElementById("ir-detail-subtitle");
    var content = document.getElementById("ir-detail-content");
    if (titleEl) titleEl.textContent = req.restaurant_name || "Demande #" + req.id;
    if (subEl) {
      subEl.textContent =
        "Demandé le " + formatDateShort(req.created_at) + " · " + statusLabel(req);
    }

    var digits = waDigits(req.phone);
    var waUrl = buildRestaurantWaUrl(digits, req.restaurant_name);

    var linkedHtml = "";
    if (req.linked_restaurant_id) {
      linkedHtml =
        '<div class="ir-linked-box">Restaurant lié : <strong>' +
        escapeHtml(req.linked_restaurant_name || "#" + req.linked_restaurant_id) +
        '</strong><div class="ir-detail-actions">' +
        '<a class="adm-btn adm-btn--primary" href="admin-restaurants.html?id=' +
        encodeURIComponent(String(req.linked_restaurant_id)) +
        '">Voir le restaurant</a></div></div>';
    } else {
      linkedHtml =
        '<div class="ir-detail-actions">' +
        '<button type="button" class="adm-btn adm-btn--primary" id="ir-btn-create-account">Créer le compte restaurant</button>' +
        '<button type="button" class="adm-btn" id="ir-btn-link-restaurant">Lier un restaurant existant</button>' +
        "</div>";
    }

    if (content) {
      content.innerHTML =
        '<section class="ir-detail-section"><h4>Informations</h4>' +
        '<dl class="ir-info-grid">' +
        "<div><dt>Restaurant</dt><dd>" +
        escapeHtml(req.restaurant_name || "—") +
        "</dd></div>" +
        "<div><dt>Responsable</dt><dd>" +
        escapeHtml(req.contact_name || "—") +
        "</dd></div>" +
        "<div><dt>WhatsApp</dt><dd>" +
        escapeHtml(req.phone || "—") +
        "</dd></div>" +
        "<div><dt>Ville</dt><dd>" +
        escapeHtml(req.city || "—") +
        "</dd></div>" +
        "<div><dt>Date de demande</dt><dd>" +
        escapeHtml(formatDateShort(req.created_at)) +
        "</dd></div>" +
        "<div><dt>Dernière activité</dt><dd>" +
        escapeHtml(formatDateTime(req.last_activity_at)) +
        "</dd></div>" +
        "<div><dt>Statut</dt><dd><span class=\"" +
        statusClass(req.status) +
        '">' +
        escapeHtml(statusLabel(req)) +
        "</span></dd></div>" +
        (String(req.status || "").toLowerCase() === "completed" ?
          "<div><dt>Revenu</dt><dd><strong>" +
            escapeHtml(formatRevenueCell(req)) +
            "</strong></dd></div>"
        : "") +
        "</dl></section>" +
        '<section class="ir-detail-section"><h4>Communication</h4>' +
        '<div class="ir-detail-actions">' +
        '<a class="adm-btn adm-mini-btn--wa adm-btn" href="' +
        (waUrl === "#" ? "#" : escapeHtml(waUrl)) +
        '"' +
        (waUrl === "#" ? ' aria-disabled="true"' : ' target="_blank" rel="noopener noreferrer"') +
        ">Contacter WhatsApp</a>" +
        '<button type="button" class="adm-btn" id="ir-btn-mark-contact">Marquer contact enregistré</button>' +
        "</div>" +
        "<p class=\"ir-card__meta\">Dernier contact : " +
        escapeHtml(formatDateTime(req.last_contacted_at)) +
        "</p>" +
        "<h4>Notes internes</h4>" +
        renderNotesHtml(req.notes) +
        '<form class="ir-note-form" id="ir-note-form">' +
        '<textarea id="ir-note-text" placeholder="Ajouter une note interne…" maxlength="2000"></textarea>' +
        '<button type="submit" class="adm-btn adm-btn--primary">Ajouter la note</button>' +
        "</form></section>" +
        '<section class="ir-detail-section"><h4>Checklist</h4>' +
        renderChecklistHtml(req.checklist, req.id) +
        "</section>" +
        '<section class="ir-detail-section"><h4>Restaurant</h4>' +
        linkedHtml +
        "</section>" +
        '<section class="ir-detail-section"><h4>Historique</h4>' +
        renderHistoryHtml(req.events) +
        "</section>";

      bindDetailEvents(req);
    }

    setDetailModalOpen(true);
  }

  function bindDetailEvents(req) {
    var markBtn = document.getElementById("ir-btn-mark-contact");
    if (markBtn) {
      markBtn.addEventListener("click", function () {
        postContact(req.id);
      });
    }

    var noteForm = document.getElementById("ir-note-form");
    if (noteForm) {
      noteForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var ta = document.getElementById("ir-note-text");
        var text = ta ? String(ta.value || "").trim() : "";
        if (!text) return;
        postNote(req.id, text).then(function (ok) {
          if (ok && ta) ta.value = "";
        });
      });
    }

    var detailContent = document.getElementById("ir-detail-content");
    if (detailContent) {
      detailContent.querySelectorAll(".ir-checklist-item input[type=checkbox]").forEach(function (cb) {
        cb.addEventListener("change", function () {
          saveChecklistFromDom(req.id);
        });
      });
    }

    var createBtn = document.getElementById("ir-btn-create-account");
    if (createBtn) {
      createBtn.addEventListener("click", function () {
        openCreateModal(req);
      });
    }

    var linkBtn = document.getElementById("ir-btn-link-restaurant");
    if (linkBtn) {
      linkBtn.addEventListener("click", function () {
        promptLinkRestaurant(req.id);
      });
    }
  }

  async function patchStatus(id, status, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) {
      return false;
    }
    var token = getToken();
    var res = await fetchJson("PATCH", "/api/admin/setup-help/" + id + "/status", token, {
      body: { status: status },
    });
    if (guardApiStatus(res.status)) return false;
    if (!res.ok) {
      alert((res.data && res.data.message) || "Transition impossible.");
      return false;
    }
    await refreshAll();
    return true;
  }

  async function postContact(id) {
    var token = getToken();
    var res = await fetchJson("POST", "/api/admin/setup-help/" + id + "/contact", token, {
      body: {},
    });
    if (guardApiStatus(res.status)) return;
    if (!res.ok) {
      alert((res.data && res.data.message) || "Impossible d'enregistrer le contact.");
      return;
    }
    await refreshAll();
  }

  async function postNote(id, text) {
    var token = getToken();
    var res = await fetchJson("POST", "/api/admin/setup-help/" + id + "/notes", token, {
      body: { note: text },
    });
    if (guardApiStatus(res.status)) return false;
    if (!res.ok) {
      alert((res.data && res.data.message) || "Impossible d'ajouter la note.");
      return false;
    }
    await openDetail(id, true);
    await loadList(token);
    return true;
  }

  function collectChecklistFromDom() {
    var checklist = {};
    document.querySelectorAll(".ir-checklist-item input[type=checkbox]").forEach(function (cb) {
      var section = cb.getAttribute("data-section");
      var key = cb.getAttribute("data-key");
      if (!section || !key) return;
      if (!checklist[section]) checklist[section] = {};
      checklist[section][key] = cb.checked;
    });
    return checklist;
  }

  var checklistTimer = null;
  function saveChecklistFromDom(id) {
    if (checklistTimer) window.clearTimeout(checklistTimer);
    checklistTimer = window.setTimeout(async function () {
      var token = getToken();
      var checklist = collectChecklistFromDom();
      var res = await fetchJson(
        "PATCH",
        "/api/admin/setup-help/" + id + "/checklist",
        token,
        { body: { checklist: checklist } },
      );
      if (guardApiStatus(res.status)) return;
      if (!res.ok) {
        alert((res.data && res.data.message) || "Impossible de sauvegarder la checklist.");
        return;
      }
      await loadList(token);
    }, 400);
  }

  async function promptLinkRestaurant(id) {
    var raw = window.prompt("ID du restaurant à lier :", "");
    if (raw == null) return;
    var restaurantId = Number(String(raw).trim());
    if (!Number.isInteger(restaurantId) || restaurantId < 1) {
      alert("Identifiant restaurant invalide.");
      return;
    }
    var token = getToken();
    var res = await fetchJson(
      "PATCH",
      "/api/admin/setup-help/" + id + "/link-restaurant",
      token,
      { body: { linked_restaurant_id: restaurantId } },
    );
    if (guardApiStatus(res.status)) return;
    if (!res.ok) {
      alert((res.data && res.data.message) || "Liaison impossible.");
      return;
    }
    await refreshAll();
  }

  function openCreateModal(req) {
    var errEl = document.getElementById("ir-create-error");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    var form = document.getElementById("ir-create-form");
    if (form) {
      form.setAttribute("data-request-id", String(req.id));
    }
    var fields = {
      "ir-create-restaurant": req.restaurant_name || "",
      "ir-create-fullname": req.contact_name || "",
      "ir-create-whatsapp": req.phone || "",
      "ir-create-quartier": req.city || "",
      "ir-create-email": "",
      "ir-create-password": "",
    };
    Object.keys(fields).forEach(function (fid) {
      var el = document.getElementById(fid);
      if (el) el.value = fields[fid];
    });
    setCreateModalOpen(true);
  }

  async function handleReactivate(id) {
    var choice = window.prompt(
      "Réactiver la demande.\nTapez « contacted » pour reprendre au stade Contacté, ou « new » pour Nouvelle demande :",
      "contacted",
    );
    if (choice == null) return;
    var st = String(choice).trim().toLowerCase();
    if (st !== "new" && st !== "contacted") {
      alert("Choix invalide. Utilisez « new » ou « contacted ».");
      return;
    }
    if (!window.confirm("Confirmer la réactivation au statut « " + st + " » ?")) {
      return;
    }
    await patchStatus(id, st, null);
  }

  function handleMenuAction(actionEl, requestId) {
    var action = actionEl.getAttribute("data-action");
    closeAllMenus();

    if (action === "detail") {
      openDetail(requestId);
      return;
    }
    if (action === "contact") {
      postContact(requestId);
      return;
    }
    if (action === "status") {
      var st = actionEl.getAttribute("data-status");
      var confirmMsg = actionEl.getAttribute("data-confirm") || "";
      patchStatus(requestId, st, confirmMsg || null);
      return;
    }
    if (action === "reactivate") {
      handleReactivate(requestId);
    }
  }

  function initShell() {
    var body = document.body;
    var sidebarBtn = document.getElementById("adm-open-sidebar");
    var overlay = document.getElementById("adm-overlay");

    function setOpen(open) {
      body.classList.toggle("adm-sidebar-open", open);
      if (sidebarBtn) sidebarBtn.setAttribute("aria-expanded", open ? "true" : "false");
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
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        setOpen(false);
        setDetailModalOpen(false);
        setCreateModalOpen(false);
        closeAllMenus();
      }
    });
  }

  function bindEvents() {
    document.getElementById("ir-refresh")?.addEventListener("click", refreshAll);

    var searchInp = document.getElementById("ir-search");
    if (searchInp) {
      searchInp.addEventListener("input", function () {
        if (searchTimer) window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () {
          loadList(getToken());
        }, 350);
      });
    }

    document.getElementById("ir-filter")?.addEventListener("change", function () {
      loadList(getToken());
    });

    window.addEventListener("resize", closeAllMenus);
    window.addEventListener(
      "scroll",
      function () {
        if (menuCloseSuspended || openMenuId == null) return;
        closeAllMenus();
      },
      true,
    );

    document.addEventListener("click", function (ev) {
      var menuBtn = ev.target.closest(".ir-menu-btn");
      if (menuBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        var id = menuBtn.getAttribute("data-menu");
        var actionsCell = menuBtn.closest(".ir-actions-cell, .ir-card-actions");
        var dropdown = actionsCell ? actionsCell.querySelector(".ir-dropdown") : null;
        var wasOpen = dropdown && dropdown.classList.contains("is-open");
        closeAllMenus();
        if (!wasOpen && dropdown) {
          dropdown.classList.add("is-open");
          menuBtn.setAttribute("aria-expanded", "true");
          openMenuId = id;
          placeOpenMenu(dropdown, menuBtn);
        }
        return;
      }

      var actionEl = ev.target.closest("[data-action]");
      if (actionEl) {
        var actionType = actionEl.getAttribute("data-action");
        if (actionType === "wa") {
          closeAllMenus();
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        var requestId = resolveRequestId(actionEl);
        if (requestId) {
          handleMenuAction(actionEl, requestId);
        }
        return;
      }

      if (!ev.target.closest(".ir-dropdown") && !ev.target.closest(".ir-menu-btn")) {
        closeAllMenus();
      }

      var rowClick = ev.target.closest("tr[data-request-id], .ir-card[data-request-id]");
      if (
        rowClick &&
        !ev.target.closest(".ir-actions-cell, .ir-card-actions, .ir-dropdown")
      ) {
        openDetail(rowClick.getAttribute("data-request-id"));
      }
    });

    document.querySelectorAll("[data-close-detail]").forEach(function (el) {
      el.addEventListener("click", function () {
        setDetailModalOpen(false);
      });
    });

    document.querySelectorAll("[data-close-create]").forEach(function (el) {
      el.addEventListener("click", function () {
        setCreateModalOpen(false);
      });
    });

    var createForm = document.getElementById("ir-create-form");
    if (createForm) {
      createForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var requestId = createForm.getAttribute("data-request-id");
        if (!requestId) return;
        var errEl = document.getElementById("ir-create-error");
        var payload = {
          restaurantName: String(
            (document.getElementById("ir-create-restaurant") || {}).value || "",
          ).trim(),
          fullName: String(
            (document.getElementById("ir-create-fullname") || {}).value || "",
          ).trim(),
          whatsapp: String(
            (document.getElementById("ir-create-whatsapp") || {}).value || "",
          ).trim(),
          quartier: String(
            (document.getElementById("ir-create-quartier") || {}).value || "",
          ).trim(),
          email: String((document.getElementById("ir-create-email") || {}).value || "").trim(),
          password: String(
            (document.getElementById("ir-create-password") || {}).value || "",
          ),
        };
        if (errEl) {
          errEl.hidden = true;
        }
        var token = getToken();
        var res = await fetchJson(
          "POST",
          "/api/admin/setup-help/" + requestId + "/create-restaurant",
          token,
          { body: payload },
        );
        if (guardApiStatus(res.status)) return;
        if (!res.ok) {
          var msg =
            res.data && res.data.message ?
              res.data.message
            : res.data && res.data.errors && res.data.errors[0] ?
              res.data.errors[0].message
            : "Création impossible.";
          if (errEl) {
            errEl.textContent = msg;
            errEl.hidden = false;
          }
          return;
        }
        setCreateModalOpen(false);
        await refreshAll();
      });
    }
  }

  async function init() {
    var allowed = await window.MenuGo_AdminGuard.enforceAdminAccess({
      loginNext: LOGIN_NEXT,
    });
    if (!allowed) return;
    initShell();
    bindEvents();
    await refreshAll();

    var params = new URLSearchParams(window.location.search);
    var openId = params.get("id");
    if (openId && /^\d+$/.test(openId)) {
      openDetail(openId);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
