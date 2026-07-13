/**
 * Admin — liste restaurants : recherche, filtres abonnement/menu, actions.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";
  var ADMIN_BACKUP_TOKEN = "MenuGo_admin_token";
  var ADMIN_BACKUP_USER = "MenuGo_admin_user";
  var ADMIN_RETURN_URL = "MenuGo_admin_return";
  var LOGIN_NEXT = "admin-restaurants.html";
  var PAGE_SIZE = 12;
  var DEBOUNCE_MS = 320;

  function guardApiStatus(status) {
    return window.MenuGo_AdminGuard.handleAdminApiStatus(status, {
      loginNext: LOGIN_NEXT,
    });
  }

  var state = {
    page: 1,
    q: "",
    subscription: "all",
    menu: "all",
    loading: false,
    totalPages: 0,
    total: 0,
  };

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

  function resolveMediaUrl(rel) {
    if (rel == null || String(rel).trim() === "") {
      return "";
    }
    if (window.MenuGo_DomSafe && window.MenuGo_DomSafe.sanitizeImageSrc) {
      return window.MenuGo_DomSafe.sanitizeImageSrc(rel, getApiBase());
    }
    var u = String(rel).trim();
    if (/^(javascript|data|vbscript):/i.test(u)) {
      return "";
    }
    if (/^https?:\/\//i.test(u)) {
      return u;
    }
    if (u.indexOf("/uploads/") !== 0 || u.indexOf("..") !== -1) {
      return "";
    }
    var base = getApiBase();
    return base ? base + u : u;
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
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {}
  }

  function formatDateShort(iso) {
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

  function labelSubscription(st) {
    var s = String(st || "trial")
      .toLowerCase()
      .trim();
    if (s === "active") return "Actif";
    if (s === "expired") return "Expiré";
    if (s === "suspended") return "Suspendu";
    return "Essai";
  }

  function subscriptionBadge(st) {
    var s = String(st || "trial")
      .toLowerCase()
      .trim();
    var cls = "rs-badge-sub rs-badge-sub--trial";
    if (s === "active") cls = "rs-badge-sub rs-badge-sub--active";
    else if (s === "expired") cls = "rs-badge-sub rs-badge-sub--expired";
    else if (s === "suspended") cls = "rs-badge-sub rs-badge-sub--suspended";
    return (
      '<span class="' +
      cls +
      '" role="status">' +
      escapeHtml(labelSubscription(s)) +
      "</span>"
    );
  }

  function menuRowBadge(menuSuspended) {
    if (menuSuspended) {
      return '<span class="rs-badge-menu rs-badge-menu--off" role="status">Menu indisponible</span>';
    }
    return '<span class="rs-badge-menu rs-badge-menu--live" role="status">Menu en ligne</span>';
  }

  function cityCell(row) {
    var q = row.quartier || row.city;
    if (q) {
      return '<span class="resto-city">' + escapeHtml(q) + "</span>";
    }
    return '<span class="resto-city resto-city--soon">Quartier non renseigné</span>';
  }

  async function fetchJson(method, path, token, opts) {
    opts = opts || {};
    var base = getApiBase();
    var headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };
    if (opts.body != null && !opts.skipJsonHeaders) {
      headers["Content-Type"] = "application/json";
    }
    try {
      var p = String(path || "");
      if (String(base).endsWith("/api") && p.indexOf("/api") === 0) {
        p = p.replace(/^\/api/, "");
      }
      var url =
        String(base).replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");
      var response = await fetch(url, {
        method: method,
        headers: headers,
        body:
          opts.body !== undefined
            ? typeof opts.body === "string"
              ? opts.body
              : JSON.stringify(opts.body)
            : undefined,
      });

      var data = null;
      var text = "";
      try {
        text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = null;
      }

      return { ok: response.ok, status: response.status, data: data };
    } catch (err) {
      return { ok: false, status: 0, data: null };
    }
  }

  function renderPagination() {
    var nav = document.getElementById("resto-pagination");
    if (!nav) return;

    nav.innerHTML = "";

    var totalPages = state.totalPages;
    var page = state.page;

    if (totalPages <= 1) {
      nav.setAttribute("hidden", "");
      return;
    }
    nav.removeAttribute("hidden");

    var info = document.createElement("p");
    info.className = "users-pagination__info";
    info.textContent =
      "Page " +
      page +
      " sur " +
      totalPages +
      " — " +
      state.total +
      " restaurant(s)";
    nav.appendChild(info);

    var prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Préc.";
    prev.disabled = page <= 1;
    prev.addEventListener("click", function () {
      if (state.page > 1) {
        state.page -= 1;
        loadRestaurants();
      }
    });
    nav.appendChild(prev);

    var windowSize = 5;
    var start = Math.max(1, page - Math.floor(windowSize / 2));
    var end = Math.min(totalPages, start + windowSize - 1);
    if (end - start + 1 < windowSize) {
      start = Math.max(1, end - windowSize + 1);
    }

    for (var i = start; i <= end; i++) {
      (function (p) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = String(p);
        if (p === page) {
          b.classList.add("is-current");
          b.setAttribute("aria-current", "page");
        }
        b.addEventListener("click", function () {
          state.page = p;
          loadRestaurants();
        });
        nav.appendChild(b);
      })(i);
    }

    var next = document.createElement("button");
    next.type = "button";
    next.textContent = "Suiv.";
    next.disabled = page >= totalPages;
    next.addEventListener("click", function () {
      if (state.page < totalPages) {
        state.page += 1;
        loadRestaurants();
      }
    });
    nav.appendChild(next);
  }

  function logoMarkup(row, sizeCls) {
    var url = resolveMediaUrl(row.logo_url);
    var initial =
      escapeHtml(
        String(row.name || "?")
          .trim()
          .slice(0, 1)
          .toUpperCase(),
      ) || "?";
    if (!url) {
      return (
        '<div class="' +
        escapeHtml(sizeCls) +
        ' resto-logo-thumb resto-logo-thumb--fallback" aria-hidden="true">' +
        initial +
        "</div>"
      );
    }
    return (
      '<img class="' +
      escapeHtml(sizeCls) +
      ' resto-logo-thumb" src="' +
      escapeHtml(url) +
      '" alt="" width="46" height="46" loading="lazy" referrerpolicy="no-referrer"/>'
    );
  }

  function buildActionButtons(row) {
    var id = encodeURIComponent(row.id);
    var dashBtn =
      '<button type="button" class="adm-btn adm-btn--install" data-act="dashboard" data-id="' +
      id +
      '">Tableau de bord</button>';
    var menuBtn =
      '<button type="button" class="adm-btn" data-act="menu" data-id="' +
      id +
      '">Voir menu</button>';
    var detBtn =
      '<button type="button" class="adm-btn" data-act="detail" data-id="' +
      id +
      '">Voir détails</button>';
    var suspendLabel = row.menu_suspended ? "Réactiver menu" : "Suspendre menu";
    var suspendAct = row.menu_suspended ? "menu-on" : "menu-off";
    var menuToggle =
      '<button type="button" class="adm-btn adm-btn--primary" data-act="' +
      suspendAct +
      '" data-id="' +
      id +
      '">' +
      suspendLabel +
      "</button>";
    var del =
      '<button type="button" class="adm-btn adm-btn--danger" data-act="delete" data-id="' +
      id +
      '">Supprimer</button>';
    return dashBtn + menuBtn + detBtn + menuToggle + del;
  }

  function tbodyPlaceholder(msg) {
    return (
      '<tr class="adm-table__placeholder"><td colspan="7">' +
      escapeHtml(msg) +
      "</td></tr>"
    );
  }

  async function loadRestaurants() {
    if (state.loading) return;

    state.loading = true;
    hideAccessBanner();

    var tbody = document.getElementById("resto-body");
    var cardsUl = document.getElementById("resto-cards-list");
    var token = localStorage.getItem(TOKEN_KEY);
    var base = getApiBase();

    if (!base) {
      showAccessBanner(
        "Impossible de joindre l’API — vérifiez frontend/js/config.js (API_URL).",
        "error",
      );
      if (tbody) tbody.innerHTML = tbodyPlaceholder("Erreur de configuration.");
      state.loading = false;
      return;
    }

    if (tbody) tbody.innerHTML = tbodyPlaceholder("Chargement…");

    var qs =
      "?page=" +
      encodeURIComponent(String(state.page)) +
      "&pageSize=" +
      encodeURIComponent(String(PAGE_SIZE)) +
      "&subscription=" +
      encodeURIComponent(state.subscription) +
      "&menu=" +
      encodeURIComponent(state.menu) +
      (state.q ? "&q=" + encodeURIComponent(state.q) : "");

    var res = await fetchJson("GET", "/api/admin/restaurants" + qs, token);
    state.loading = false;

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok || !res.data || !Array.isArray(res.data.restaurants)) {
      showAccessBanner("Impossible de charger les restaurants.", "error");
      if (tbody) tbody.innerHTML = tbodyPlaceholder("Erreur de chargement.");
      state.totalPages = 0;
      state.total = 0;
      renderPagination();
      return;
    }

    var list = res.data.restaurants;
    state.totalPages = Number(res.data.totalPages) || 0;
    state.total = Number(res.data.total) || 0;

    var countLabel = document.getElementById("resto-count-label");
    if (countLabel) {
      countLabel.textContent =
        state.total +
        " restaurant(s)" +
        (state.q ? " pour « " + state.q.trim() + " »" : "");
    }

    if (state.totalPages > 0 && state.page > state.totalPages) {
      state.page = state.totalPages;
      state.loading = false;
      return loadRestaurants();
    }

    if (!list.length) {
      if (tbody) tbody.innerHTML = tbodyPlaceholder("Aucun résultat.");
      if (cardsUl) cardsUl.innerHTML = "";
      renderPagination();
      return;
    }

    if (tbody) {
      tbody.innerHTML = "";
      list.forEach(function (row) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          logoMarkup(row, "") +
          "</td>" +
          "<td>" +
          '<div class="resto-cell-name"><strong>' +
          escapeHtml(row.name) +
          "</strong>" +
          cityCell(row) +
          "</div>" +
          '<div class="resto-muted" style="margin-top:.35rem;font-size:.72rem;">' +
          escapeHtml(row.owner_email || "") +
          "</div>" +
          "</td>" +
          '<td><span class="resto-phone">' +
          escapeHtml(row.phone || "—") +
          "</span></td>" +
          "<td>" +
          escapeHtml(String(row.product_count)) +
          "</td>" +
          "<td>" +
          '<div class="resto-stack-badges">' +
          subscriptionBadge(row.subscription_status) +
          menuRowBadge(row.menu_suspended) +
          "</div>" +
          "</td>" +
          "<td>" +
          escapeHtml(formatDateShort(row.created_at)) +
          "</td>" +
          '<td><div class="resto-actions">' +
          buildActionButtons(row) +
          "</div></td>";
        tbody.appendChild(tr);
      });
    }

    if (cardsUl) {
      cardsUl.innerHTML = "";
      list.forEach(function (row) {
        var li = document.createElement("li");
        li.className = "resto-card";
        li.innerHTML =
          logoMarkup(row, "") +
          '<div class="resto-card__body">' +
          '<p class="resto-card__title">' +
          escapeHtml(row.name) +
          "</p>" +
          cityCell(row) +
          '<p class="resto-muted" style="margin:6px 0 0;font-size:.8rem;">' +
          escapeHtml(row.owner_email || "") +
          "</p>" +
          '<p class="resto-phone" style="margin:.45rem 0 0">' +
          escapeHtml(row.phone || "—") +
          "</p>" +
          '<div class="resto-stack-badges" style="margin-top:8px">' +
          subscriptionBadge(row.subscription_status) +
          menuRowBadge(row.menu_suspended) +
          "</div>" +
          '<div class="resto-muted" style="margin-top:6px;font-size:.8rem;">Produits : ' +
          escapeHtml(String(row.product_count)) +
          "</div>" +
          '<div class="resto-muted" style="font-size:.76rem;margin-top:2px">' +
          escapeHtml(formatDateShort(row.created_at)) +
          "</div>" +
          "</div>" +
          '<div class="resto-actions">' +
          buildActionButtons(row) +
          "</div>";
        cardsUl.appendChild(li);
      });
    }

    renderPagination();
  }

  function initShell() {
    var body = document.body;
    var sidebarBtn = document.getElementById("adm-open-sidebar");
    var sidebar = document.getElementById("adm-sidebar-panel");
    var overlay = document.getElementById("adm-overlay");

    function setOpen(open) {
      body.classList.toggle("adm-sidebar-open", open);
      if (sidebarBtn)
        sidebarBtn.setAttribute("aria-expanded", open ? "true" : "false");
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
    if (overlay) overlay.addEventListener("click", closeSidebar);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSidebar();
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

  var debTimer = null;
  function scheduleLoad() {
    if (debTimer) clearTimeout(debTimer);
    debTimer = setTimeout(function () {
      debTimer = null;
      state.page = 1;
      loadRestaurants();
    }, DEBOUNCE_MS);
  }

  function openPublicMenu(restaurantId) {
    var url = "mon-menu.html?id=" + encodeURIComponent(String(restaurantId));
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function setModalOpen(open) {
    var modal = document.getElementById("adm-resto-detail-modal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("adm-overlay-open", open);
  }

  function bindModalClose() {
    var modal = document.getElementById("adm-resto-detail-modal");
    if (!modal) return;
    modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function () {
        setModalOpen(false);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false")
        setModalOpen(false);
    });
  }

  async function openDetail(restaurantId) {
    var token = localStorage.getItem(TOKEN_KEY);
    setModalOpen(true);
    var titleEl = document.getElementById("adm-resto-detail-title");
    var bannerEl = document.getElementById("adm-resto-banner");
    if (titleEl) titleEl.textContent = "Chargement…";

    var res = await fetchJson(
      "GET",
      "/api/admin/restaurants/" + encodeURIComponent(String(restaurantId)),
      token,
    );

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok || !res.data || !res.data.restaurant) {
      setModalOpen(false);
      showAccessBanner(
        (res.data && res.data.message) || "Détail indisponible.",
        "error",
      );
      return;
    }

    var r = res.data.restaurant;
    if (titleEl) titleEl.textContent = r.name || "Restaurant";

    var ownerEl = document.getElementById("adm-resto-owner");
    if (ownerEl) ownerEl.textContent = r.owner_email || "";

    document.getElementById("adm-resto-id").textContent = String(r.id);
    document.getElementById("adm-resto-city").innerHTML =
      r.quartier || r.city
        ? escapeHtml(String(r.quartier || r.city))
        : '<span class="resto-city--soon">Non renseigné (formulaire d’inscription)</span>';
    document.getElementById("adm-resto-phone").textContent = r.phone || "—";

    var subDd = document.getElementById("adm-resto-sub");
    if (subDd) subDd.innerHTML = subscriptionBadge(r.subscription_status);

    var msDd = document.getElementById("adm-resto-menu-state");
    if (msDd) msDd.innerHTML = menuRowBadge(r.menu_suspended);

    document.getElementById("adm-resto-pc").textContent = String(
      r.product_count ?? "0",
    );
    document.getElementById("adm-resto-cc").textContent = String(
      r.category_count ?? "0",
    );

    document.getElementById("adm-resto-created").textContent = formatDateShort(
      r.created_at,
    );

    var descEl = document.getElementById("adm-resto-desc");
    var desc = String(r.description || "").trim();
    if (desc && descEl) {
      descEl.textContent = desc;
      descEl.hidden = false;
    } else if (descEl) {
      descEl.textContent = "";
      descEl.hidden = true;
    }

    if (bannerEl) {
      var bUrl = resolveMediaUrl(r.banner_url);
      if (bUrl) {
        bannerEl.src = bUrl;
        bannerEl.hidden = false;
        bannerEl.alt = "Bannière " + (r.name || "");
      } else {
        bannerEl.removeAttribute("src");
        bannerEl.hidden = true;
      }
    }

    var dashBtn = document.getElementById("adm-resto-open-dashboard");
    if (dashBtn) {
      dashBtn.setAttribute("data-id", String(r.id));
      dashBtn.onclick = function () {
        accessRestaurantDashboard(r.id);
      };
    }
  }

  async function accessRestaurantDashboard(restaurantId) {
    if (
      !confirm(
        "Ouvrir le tableau de bord de ce restaurant pour l’installation ?\n\nVous serez connecté en tant que propriétaire du restaurant.",
      )
    ) {
      return;
    }

    var token = localStorage.getItem(TOKEN_KEY);
    var res = await fetchJson(
      "POST",
      "/api/admin/restaurants/" +
        encodeURIComponent(String(restaurantId)) +
        "/dashboard-access",
      token,
    );

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok || !res.data || !res.data.token) {
      showAccessBanner(
        (res.data && res.data.message) ||
          "Impossible d’ouvrir le tableau de bord du restaurant.",
        "error",
      );
      return;
    }

    try {
      sessionStorage.setItem(ADMIN_BACKUP_TOKEN, token || "");
      sessionStorage.setItem(
        ADMIN_BACKUP_USER,
        localStorage.getItem(USER_KEY) || "",
      );
      sessionStorage.setItem(ADMIN_RETURN_URL, LOGIN_NEXT);
    } catch (e) {}

    localStorage.setItem(TOKEN_KEY, res.data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user || null));
    localStorage.setItem(
      RESTAURANT_KEY,
      JSON.stringify(res.data.restaurant || null),
    );

    window.location.href = "dashboard.html";
  }

  async function patchMenuSuspend(restaurantId, suspended) {
    var token = localStorage.getItem(TOKEN_KEY);
    var res = await fetchJson(
      "PATCH",
      "/api/admin/restaurants/" +
        encodeURIComponent(String(restaurantId)) +
        "/menu",
      token,
      { body: { suspended: suspended } },
    );

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok) {
      var msg =
        res.data && res.data.message
          ? res.data.message
          : suspended
            ? "Impossible de suspendre le menu."
            : "Impossible de réactiver le menu.";
      showAccessBanner(msg, "error");
      return;
    }

    hideAccessBanner();
    await loadRestaurants();
  }

  async function deleteRestaurant(restaurantId) {
    if (
      !confirm(
        "Supprimer définitivement ce restaurant, ses catégories et produits associés ?",
      )
    ) {
      return;
    }
    var token = localStorage.getItem(TOKEN_KEY);
    var res = await fetchJson(
      "DELETE",
      "/api/admin/restaurants/" + encodeURIComponent(String(restaurantId)),
      token,
      { skipJsonHeaders: true },
    );

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok) {
      var msg =
        res.data && typeof res.data.message === "string"
          ? res.data.message
          : "Suppression impossible.";
      showAccessBanner(msg, "error");
      return;
    }

    hideAccessBanner();
    await loadRestaurants();
  }

  function attachHandlers() {
    var qInput = document.getElementById("resto-q");
    var subSel = document.getElementById("resto-filter-subscription");
    var menuSel = document.getElementById("resto-filter-menu");

    if (qInput) {
      qInput.addEventListener("input", function () {
        state.q = String(qInput.value || "")
          .trim()
          .slice(0, 160);
        scheduleLoad();
      });
      qInput.addEventListener("search", function () {
        state.q = String(qInput.value || "")
          .trim()
          .slice(0, 160);
        state.page = 1;
        loadRestaurants();
      });
    }

    if (subSel) {
      subSel.addEventListener("change", function () {
        state.subscription = String(subSel.value || "all").toLowerCase();
        state.page = 1;
        loadRestaurants();
      });
    }

    if (menuSel) {
      menuSel.addEventListener("change", function () {
        state.menu = String(menuSel.value || "all").toLowerCase();
        state.page = 1;
        loadRestaurants();
      });
    }

    var panel = document.getElementById("adm-resto-panel");
    if (!panel) {
      panel = document.getElementById("admin-main");
    }

    panel.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-act]");
      if (!btn || btn.disabled || !panel.contains(btn)) return;

      var tbody = document.getElementById("resto-body");
      var ul = document.getElementById("resto-cards-list");
      if (!tbody || !ul) return;
      if (!tbody.contains(btn) && !ul.contains(btn)) return;

      var id = btn.getAttribute("data-id");
      var act = btn.getAttribute("data-act");
      if (!id || !act) return;

      e.preventDefault();

      if (act === "menu") openPublicMenu(id);
      else if (act === "dashboard") accessRestaurantDashboard(id);
      else if (act === "detail") openDetail(id);
      else if (act === "menu-off") patchMenuSuspend(id, true);
      else if (act === "menu-on") patchMenuSuspend(id, false);
      else if (act === "delete") deleteRestaurant(id);
    });
  }

  async function init() {
    var allowed = await window.MenuGo_AdminGuard.enforceAdminAccess({
      loginNext: LOGIN_NEXT,
    });
    if (!allowed) {
      return;
    }
    initShell();
    attachHandlers();
    bindModalClose();

    var qEl = document.getElementById("resto-q");
    if (qEl) state.q = String(qEl.value || "").trim();
    loadRestaurants();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
