/**
 * Admin — page Utilisateurs (liste, recherche, filtre statut, pagination, actions).
 */
(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";
  var LOGIN_NEXT = "admin-users.html";
  var PAGE_SIZE = 12;
  var DEBOUNCE_MS = 340;

  function guardApiStatus(status) {
    return window.MenuGo_AdminGuard.handleAdminApiStatus(status, {
      loginNext: LOGIN_NEXT,
    });
  }

  var state = {
    page: 1,
    q: "",
    status: "all",
    loading: false,
    totalPages: 0,
    total: 0,
  };

  var detailUserId = null;
  var detailUserEmail = "";

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

  function getSelfUserId() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      var id = parsed && parsed.id;
      var n = Number(id);
      return Number.isInteger(n) && n > 0 ? n : null;
    } catch (e) {
      return null;
    }
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

  function formatQuartier(value) {
    if (value == null || String(value).trim() === "") {
      return "—";
    }
    return String(value).trim();
  }

  function quartierCellHtml(value) {
    var text = formatQuartier(value);
    if (text === "—") {
      return '<span class="users-quartier users-quartier--empty">—</span>';
    }
    return '<span class="users-quartier">' + escapeHtml(text) + "</span>";
  }

  function statusBadge(status) {
    var st = String(status || "")
      .toLowerCase()
      .trim();
    var isSuspended = st === "suspended";
    var label = isSuspended ? "Suspendu" : "Actif";
    var cls = isSuspended
      ? "users-badge users-badge--suspended"
      : "users-badge users-badge--active";
    return (
      '<span class="' + cls + '" role="status">' + escapeHtml(label) + "</span>"
    );
  }

  async function fetchJson(method, path, token, opts) {
    opts = opts || {};
    var base = getApiBase();
    var headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };
    if (opts.body && !opts.skipJsonHeaders) {
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
        body: opts.body ? JSON.stringify(opts.body) : undefined,
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
    var nav = document.getElementById("users-pagination");
    if (!nav) {
      return;
    }

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
      " utilisateur(s)";
    nav.appendChild(info);

    var prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Préc.";
    prev.disabled = page <= 1;
    prev.addEventListener("click", function () {
      if (state.page > 1) {
        state.page -= 1;
        loadUsers();
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
          loadUsers();
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
        loadUsers();
      }
    });
    nav.appendChild(next);
  }

  function buildActionButtons(row) {
    var selfId = getSelfUserId();
    var isSelf = selfId != null && Number(row.id) === selfId;

    var det =
      '<button type="button" class="adm-btn" data-act="detail" data-id="' +
      encodeURIComponent(row.id) +
      '">Voir détails</button>';

    var suspendDisabled =
      isSelf || row.status === "suspended" ? " disabled" : "";
    var activateDisabled =
      isSelf || row.status !== "suspended" ? " disabled" : "";
    var delDisabled = isSelf ? " disabled" : "";

    var suspendBtn =
      '<button type="button" class="adm-btn" data-act="suspend" data-id="' +
      encodeURIComponent(row.id) +
      '"' +
      suspendDisabled +
      ' title="' +
      (isSelf ? "Impossible sur votre compte" : "") +
      '">Suspendre</button>';

    var activateBtn =
      '<button type="button" class="adm-btn adm-btn--primary" data-act="activate" data-id="' +
      encodeURIComponent(row.id) +
      '"' +
      activateDisabled +
      ">" +
      "Activer</button>";

    var deleteBtn =
      '<button type="button" class="adm-btn adm-btn--danger" data-act="delete" data-id="' +
      encodeURIComponent(row.id) +
      '"' +
      delDisabled +
      ">" +
      "Supprimer</button>";

    return det + suspendBtn + activateBtn + deleteBtn;
  }

  function tbodyPlaceholder(msg) {
    return (
      '<tr class="adm-table__placeholder">' +
      '<td colspan="5">' +
      escapeHtml(msg) +
      "</td>" +
      "</tr>"
    );
  }

  async function loadUsers() {
    if (state.loading) {
      return;
    }

    state.loading = true;
    hideAccessBanner();

    var tbody = document.getElementById("users-body");
    var cardsUl = document.getElementById("users-cards-list");
    var token = localStorage.getItem(TOKEN_KEY);
    var base = getApiBase();

    if (!base) {
      showAccessBanner(
        "Impossible de joindre l’API : vérifiez frontend/js/config.js (API_URL).",
        "error",
      );
      if (tbody) {
        tbody.innerHTML = tbodyPlaceholder("Erreur de configuration.");
      }
      state.loading = false;
      return;
    }

    if (tbody) {
      tbody.innerHTML = tbodyPlaceholder("Chargement…");
    }

    var qs =
      "?page=" +
      encodeURIComponent(String(state.page)) +
      "&pageSize=" +
      encodeURIComponent(String(PAGE_SIZE)) +
      "&status=" +
      encodeURIComponent(state.status) +
      (state.q ? "&q=" + encodeURIComponent(state.q) : "");

    var res = await fetchJson("GET", "/api/admin/users" + qs, token);

    state.loading = false;

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok || !res.data || !Array.isArray(res.data.users)) {
      showAccessBanner(
        "Impossible de charger la liste des utilisateurs.",
        "error",
      );
      if (tbody) {
        tbody.innerHTML = tbodyPlaceholder("Erreur lors du chargement.");
      }
      state.totalPages = 0;
      state.total = 0;
      renderPagination();
      return;
    }

    var users = res.data.users;
    state.totalPages = Number(res.data.totalPages) || 0;
    state.total = Number(res.data.total) || 0;

    if (state.totalPages > 0 && state.page > state.totalPages) {
      state.page = state.totalPages;
      state.loading = false;
      return loadUsers();
    }

    var label = document.getElementById("users-count-label");
    if (label) {
      label.textContent =
        state.total +
        " utilisateur(s)" +
        (state.q ? " pour « " + state.q.trim() + " »" : "");
    }

    if (!users.length) {
      if (tbody) {
        tbody.innerHTML = tbodyPlaceholder(
          "Aucun utilisateur ne correspond aux critères.",
        );
      }
      if (cardsUl) {
        cardsUl.innerHTML = "";
      }
      renderPagination();
      return;
    }

    if (tbody) {
      tbody.innerHTML = "";
      users.forEach(function (row) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          '<div class="users-cell-name">' +
          escapeHtml(row.nom) +
          '<span class="users-cell-email">' +
          escapeHtml(row.email || "") +
          "</span>" +
          "</div>" +
          "</td>" +
          "<td>" +
          statusBadge(row.status) +
          "</td>" +
          "<td>" +
          escapeHtml(formatDateShort(row.created_at)) +
          "</td>" +
          "<td>" +
          quartierCellHtml(row.quartier) +
          "</td>" +
          '<td><div class="users-actions">' +
          buildActionButtons(row) +
          "</div></td>";
        tbody.appendChild(tr);
      });
    }

    if (cardsUl) {
      cardsUl.innerHTML = "";
      users.forEach(function (row) {
        var li = document.createElement("li");
        li.className = "users-card";
        li.innerHTML =
          '<div class="users-card__head">' +
          "<div>" +
          '<p class="users-card__name">' +
          escapeHtml(row.nom) +
          "</p>" +
          '<p class="users-card__date">' +
          escapeHtml(formatDateShort(row.created_at)) +
          "</p>" +
          '<p class="users-card__quartier">' +
          "Quartier : " +
          escapeHtml(formatQuartier(row.quartier)) +
          "</p>" +
          "</div>" +
          statusBadge(row.status) +
          "</div>" +
          '<span class="users-cell-email">' +
          escapeHtml(row.email || "") +
          "</span>" +
          '<div class="users-actions">' +
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

  var debounceTimer = null;

  function scheduleLoad() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      state.page = 1;
      loadUsers();
    }, DEBOUNCE_MS);
  }

  function attachToolbar() {
    var qInput = document.getElementById("users-q");
    var sel = document.getElementById("users-status-filter");

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
        loadUsers();
      });
    }

    if (sel) {
      sel.addEventListener("change", function () {
        state.status = String(sel.value || "all").toLowerCase();
        state.page = 1;
        loadUsers();
      });
    }

    var usersPanel = document.getElementById("adm-users-panel");
    if (!usersPanel) {
      usersPanel = document.getElementById("admin-main");
    }
    if (!usersPanel) {
      usersPanel = document.body;
    }
    usersPanel.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-act]");
      if (!btn || btn.disabled || !usersPanel.contains(btn)) {
        return;
      }
      var tbody = document.getElementById("users-body");
      var cards = document.getElementById("users-cards-list");
      if (!tbody || !cards) {
        return;
      }
      if (!tbody.contains(btn) && !cards.contains(btn)) {
        return;
      }
      var id = btn.getAttribute("data-id");
      var act = btn.getAttribute("data-act");
      if (!id || !act) {
        return;
      }
      e.preventDefault();
      if (act === "detail") {
        openUserDetail(id);
      } else if (act === "suspend") {
        patchUserStatus(id, "suspended");
      } else if (act === "activate") {
        patchUserStatus(id, "active");
      } else if (act === "delete") {
        deleteUser(id);
      }
    });
  }

  function setModalOpen(open) {
    var modal = document.getElementById("adm-user-detail-modal");
    if (!modal) {
      return;
    }
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("adm-overlay-open", open);
  }

  function bindModalClose() {
    var modal = document.getElementById("adm-user-detail-modal");
    if (!modal) {
      return;
    }
    modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function () {
        setModalOpen(false);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
        setModalOpen(false);
      }
    });
  }

  function setPwdModalOpen(open) {
    var pwdModal = document.getElementById("adm-user-pwd-modal");
    if (!pwdModal) {
      return;
    }
    pwdModal.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("adm-pwd-modal-open", open);
    if (!open) {
      clearPwdForm();
    }
  }

  function clearPwdForm() {
    var form = document.getElementById("adm-user-pwd-form");
    var errEl = document.getElementById("adm-user-pwd-error");
    var okEl = document.getElementById("adm-user-pwd-success");
    var submitBtn = document.getElementById("adm-user-pwd-submit");
    if (form) {
      form.reset();
    }
    if (errEl) {
      errEl.textContent = "";
      errEl.hidden = true;
    }
    if (okEl) {
      okEl.textContent = "";
      okEl.hidden = true;
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enregistrer";
    }
  }

  function showPwdError(msg) {
    var errEl = document.getElementById("adm-user-pwd-error");
    var okEl = document.getElementById("adm-user-pwd-success");
    if (okEl) {
      okEl.hidden = true;
      okEl.textContent = "";
    }
    if (errEl) {
      errEl.textContent = msg || "";
      errEl.hidden = !msg;
    }
  }

  function showPwdSuccess(msg) {
    var errEl = document.getElementById("adm-user-pwd-error");
    var okEl = document.getElementById("adm-user-pwd-success");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    if (okEl) {
      okEl.textContent = msg || "";
      okEl.hidden = !msg;
    }
  }

  function bindPasswordModal() {
    var openBtn = document.getElementById("adm-user-pwd-open");
    var pwdModal = document.getElementById("adm-user-pwd-modal");
    var form = document.getElementById("adm-user-pwd-form");
    var emailEl = document.getElementById("adm-user-pwd-email");
    var submitBtn = document.getElementById("adm-user-pwd-submit");

    if (openBtn) {
      openBtn.addEventListener("click", function () {
        if (!detailUserId) {
          showAccessBanner("Utilisateur introuvable.", "error");
          return;
        }
        clearPwdForm();
        if (emailEl) {
          emailEl.textContent = detailUserEmail || "—";
        }
        setPwdModalOpen(true);
        var newInput = document.getElementById("adm-user-pwd-new");
        if (newInput) {
          newInput.focus();
        }
      });
    }

    if (pwdModal) {
      pwdModal.querySelectorAll("[data-close-pwd]").forEach(function (el) {
        el.addEventListener("click", function () {
          setPwdModalOpen(false);
        });
      });
      document.addEventListener("keydown", function (e) {
        if (
          e.key === "Escape" &&
          pwdModal.getAttribute("aria-hidden") === "false"
        ) {
          setPwdModalOpen(false);
        }
      });
    }

    if (!form) {
      return;
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!detailUserId) {
        showPwdError("Utilisateur introuvable.");
        return;
      }

      var newInput = document.getElementById("adm-user-pwd-new");
      var confirmInput = document.getElementById("adm-user-pwd-confirm");
      var password = newInput ? String(newInput.value || "") : "";
      var confirmPassword = confirmInput
        ? String(confirmInput.value || "")
        : "";

      if (!password) {
        showPwdError("Saisissez un nouveau mot de passe.");
        if (newInput) {
          newInput.focus();
        }
        return;
      }
      if (password.length < 8) {
        showPwdError("Le mot de passe doit contenir au moins 8 caractères.");
        if (newInput) {
          newInput.focus();
        }
        return;
      }
      if (password !== confirmPassword) {
        showPwdError("Les mots de passe ne correspondent pas.");
        if (confirmInput) {
          confirmInput.focus();
        }
        return;
      }

      var token = localStorage.getItem(TOKEN_KEY);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Enregistrement…";
      }

      var res = await fetchJson(
        "PATCH",
        "/api/admin/users/" +
          encodeURIComponent(String(detailUserId)) +
          "/password",
        token,
        {
          body: {
            password: password,
            confirmPassword: confirmPassword,
          },
        },
      );

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enregistrer";
      }

      if (guardApiStatus(res.status)) {
        return;
      }

      if (!res.ok) {
        var msg =
          res.data && res.data.message
            ? res.data.message
            : "Enregistrement impossible.";
        showPwdError(msg);
        return;
      }

      showPwdSuccess(
        res.data && res.data.message
          ? res.data.message
          : "Mot de passe mis à jour avec succès.",
      );
      if (newInput) {
        newInput.value = "";
      }
      if (confirmInput) {
        confirmInput.value = "";
      }
    });
  }

  async function openUserDetail(idStr) {
    var token = localStorage.getItem(TOKEN_KEY);
    var titleEl = document.getElementById("adm-user-detail-title");
    var emailEl = document.getElementById("adm-user-detail-email");
    var statusEl = document.getElementById("adm-user-detail-status");
    var createdEl = document.getElementById("adm-user-detail-created");
    var idEl = document.getElementById("adm-user-detail-id");
    var phoneEl = document.getElementById("adm-user-detail-phone");
    var quartierEl = document.getElementById("adm-user-detail-quartier");
    var listEl = document.getElementById("adm-user-detail-restaurants");
    var emptyEl = document.getElementById("adm-user-detail-restaurants-empty");

    setModalOpen(true);
    if (titleEl) {
      titleEl.textContent = "Chargement…";
    }
    if (emailEl) {
      emailEl.textContent = "";
    }
    if (phoneEl) {
      phoneEl.textContent = "";
    }
    if (quartierEl) {
      quartierEl.textContent = "";
    }

    var res = await fetchJson(
      "GET",
      "/api/admin/users/" + encodeURIComponent(idStr),
      token,
    );

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok || !res.data || !res.data.user) {
      setModalOpen(false);
      showAccessBanner(
        "Impossible de charger le détail de l’utilisateur.",
        "error",
      );
      return;
    }

    var u = res.data.user;
    detailUserId = u.id;
    detailUserEmail = u.email || "";
    var firstResto =
      Array.isArray(res.data.restaurants) && res.data.restaurants.length
        ? String(res.data.restaurants[0].name || "").trim()
        : "";

    if (titleEl) {
      titleEl.textContent = firstResto ? firstResto : "Utilisateur";
    }
    if (emailEl) {
      emailEl.textContent = u.email || "—";
    }
    if (phoneEl) {
      phoneEl.textContent = u.phone || "—";
    }
    if (statusEl) {
      statusEl.innerHTML = statusBadge(u.status);
    }
    if (createdEl) {
      createdEl.textContent = formatDateShort(u.created_at);
    }
    if (quartierEl) {
      quartierEl.textContent = formatQuartier(u.quartier);
    }
    if (idEl) {
      idEl.textContent = String(u.id);
    }

    if (listEl) {
      listEl.innerHTML = "";
    }
    var restos = Array.isArray(res.data.restaurants)
      ? res.data.restaurants
      : [];
    if (emptyEl) {
      emptyEl.hidden = restos.length > 0;
    }
    restos.forEach(function (r) {
      var li = document.createElement("li");
      var parts = [r.name || "—"];
      if (r.quartier || r.city) {
        parts.push(" — Quartier : " + formatQuartier(r.quartier || r.city));
      }
      if (r.whatsapp) {
        parts.push(" — WhatsApp : " + String(r.whatsapp));
      }
      li.textContent = parts.join("");
      if (listEl) {
        listEl.appendChild(li);
      }
    });
  }

  async function patchUserStatus(idStr, status) {
    var token = localStorage.getItem(TOKEN_KEY);
    var res = await fetchJson(
      "PATCH",
      "/api/admin/users/" + encodeURIComponent(idStr) + "/status",
      token,
      {
        body: { status: status },
      },
    );

    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok) {
      var msg =
        res.data && res.data.message ? res.data.message : "Action impossible.";
      showAccessBanner(msg, "error");
      return;
    }

    hideAccessBanner();
    await loadUsers();
  }

  async function deleteUser(idStr) {
    if (
      !confirm(
        "Supprimer définitivement cet utilisateur et ses données associées ?",
      )
    ) {
      return;
    }
    var token = localStorage.getItem(TOKEN_KEY);
    var res = await fetchJson(
      "DELETE",
      "/api/admin/users/" + encodeURIComponent(idStr),
      token,
      {
        skipJsonHeaders: true,
      },
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
    await loadUsers();
  }

  async function init() {
    var allowed = await window.MenuGo_AdminGuard.enforceAdminAccess({
      loginNext: LOGIN_NEXT,
    });
    if (!allowed) {
      return;
    }
    initShell();
    bindModalClose();
    bindPasswordModal();
    attachToolbar();

    var qInput = document.getElementById("users-q");
    if (qInput) {
      state.q = String(qInput.value || "").trim();
    }
    var sel = document.getElementById("users-status-filter");
    if (sel) {
      state.status = String(sel.value || "all").toLowerCase();
    }
    loadUsers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
