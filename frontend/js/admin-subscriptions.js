(function () {
  "use strict";

  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";
  var LOGIN_NEXT = "admin-subscriptions.html";
  var PAGE_SIZE = 12;
  var DEBOUNCE_MS = 320;

  var state = { page: 1, q: "", status: "all", loading: false, totalPages: 0, total: 0 };

  var modalRestaurantId = null;

  var adjustInitialPlanKey = "";

  /** Plans du catalogue plateforme (Admin → Paramètres), repris depuis l’API abonnements. */
  var plansCatalog = [];

  /** Clé de plan utilisée comme défaut lors du flux « Renouveler ». */
  var RENEW_DEFAULT_PLAN_KEY = "basic";

  function escapeHtml(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /** Même contraintes que le backend (`normalizePlanKey`). */
  function sanitizePlanKeyClient(v) {
    if (v === undefined || v === null) return "";
    return String(v)
      .trim()
      .toLowerCase()
      .slice(0, 48)
      .replace(/[^a-z0-9_-]/g, "");
  }

  function planChoiceLabel(plan) {
    var id = sanitizePlanKeyClient(plan.id);
    if (!id) return "Plan";
    var name = String(plan.name || id).trim() || id;
    var lbl = name + " (" + id + ")";
    var priceTag = "";
    if (plan.price_cfa !== undefined && plan.price_cfa !== null) {
      priceTag = " · " + formatCFA(Math.round(Number(plan.price_cfa) || 0));
    }
    var mo = Math.round(Number(plan.months) || 1);
    var moSuffix = mo !== 1 ? " / " + mo + " mo." : "";
    return lbl + priceTag + moSuffix;
  }

  function appendPlanOption(sel, value, label) {
    var o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    sel.appendChild(o);
  }

  /** Durée jour pour l’API activate (~30 j. / mois catalogue, plafonné comme `period_days` serveur). */
  function monthsToApproxPeriodDays(months) {
    var m = Math.round(Number(months) || 1);
    if (!Number.isInteger(m) || m < 1) m = 1;
    if (m > 120) m = 120;
    var pd = Math.round(m * 30);
    if (pd < 1) pd = 1;
    if (pd > 3650) pd = 3650;
    return pd;
  }

  /**
   * kind: `picker` = Activer (« ne pas changer » + essai + catalogue).
   *        `picker-renew` = Renouveler (catalogue + essai sans « ne pas modifier » ; mois / CFA viennent du plan choisi).
   *        `adjust` = Modale d’ajustement (essai + catalogue + retirer clé plan).
   */
  function fillPlanChoiceSelect(sel, kind) {
    if (!sel) return;
    sel.innerHTML = "";

    function appendCatalog() {
      var seen = {};
      plansCatalog.forEach(function (p) {
        var id = sanitizePlanKeyClient(p.id);
        if (!id || id === "trial" || seen[id]) return;
        seen[id] = true;
        appendPlanOption(sel, id, planChoiceLabel(p));
      });
    }

    if (kind === "picker") {
      appendPlanOption(sel, "", "— Ne pas modifier le plan —");
      appendPlanOption(sel, "trial", "Essai (trial)");
      appendCatalog();
    } else if (kind === "picker-renew") {
      appendCatalog();
      appendPlanOption(sel, "trial", "Essai (trial)");
    } else if (kind === "adjust") {
      appendPlanOption(sel, "trial", "Essai (trial)");
      appendCatalog();
      appendPlanOption(sel, "", "— Retirer la clé plan —");
    }
  }

  /** Présélection plan pour le dialogue (ex. basic en renouvellement). */
  function applyDefaultPlanSelection(sel, preferredKeyRaw) {
    if (!sel) return;
    var preferred = sanitizePlanKeyClient(preferredKeyRaw || RENEW_DEFAULT_PLAN_KEY);
    function setIfExists(key) {
      var k = sanitizePlanKeyClient(key);
      if (!k) return false;
      var ok = Array.prototype.some.call(sel.options, function (o) {
        return String(o.value) === k;
      });
      if (ok) sel.value = k;
      return ok;
    }
    if (setIfExists(preferred)) return;

    var i;
    var p;

    // Correspond Basic 3 500 / 1 mois même si l’admin a renommé la clé
    for (i = 0; i < plansCatalog.length; i++) {
      p = plansCatalog[i];
      var pid = sanitizePlanKeyClient(p.id);
      if (!pid || pid === "trial") continue;
      var price = Math.round(Number(p.price_cfa) || 0);
      var mo = Math.round(Number(p.months) || 1);
      var nm = String(p.name || "").toLowerCase();
      if (price === 3500 && mo === 1 && (pid === "basic" || nm.indexOf("basic") !== -1)) {
        if (setIfExists(pid)) return;
      }
    }
    for (i = 0; i < plansCatalog.length; i++) {
      p = plansCatalog[i];
      var pid2 = sanitizePlanKeyClient(p.id);
      if (!pid2 || pid2 === "trial") continue;
      var price2 = Math.round(Number(p.price_cfa) || 0);
      var mo2 = Math.round(Number(p.months) || 1);
      if (price2 === 3500 && mo2 === 1) {
        if (setIfExists(pid2)) return;
      }
    }

    for (i = 0; i < sel.options.length; i++) {
      var v = sanitizePlanKeyClient(sel.options[i].value);
      if (v && v !== "trial") {
        sel.value = sel.options[i].value;
        return;
      }
    }
  }

  function refillAdjustPlanSelect(serverKeyRaw) {
    var sel = document.getElementById("subs-adj-plan-key");
    if (!sel || sel.tagName !== "SELECT") return;
    fillPlanChoiceSelect(sel, "adjust");
    var k = sanitizePlanKeyClient(serverKeyRaw);
    var has = Array.prototype.some.call(sel.options, function (o) {
      return String(o.value) === k && k !== "";
    });
    if (k !== "" && !has) {
      var opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k + " (plan actuel)";
      if (sel.lastChild && sel.options.length >= 2) sel.insertBefore(opt, sel.lastChild);
      else sel.appendChild(opt);
    }
    sel.value = k;
  }

  /**
   * @param {{ renewOnly?: boolean, renewDefaultPrompt?: string }=} opts
   */
  function fallbackPlanPickWithPrompt(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ids = {};
      var keyList = [];
      ids.trial = true;
      keyList.push("trial");
      plansCatalog.forEach(function (p) {
        var id = sanitizePlanKeyClient(p.id);
        if (!id || id === "trial" || ids[id]) return;
        ids[id] = true;
        keyList.push(id);
      });

      var helpRenew =
        "Renouvellement : tapez une clé de plan présente dans le catalogue (ex. " +
        sanitizePlanKeyClient(RENEW_DEFAULT_PLAN_KEY) +
        "). Clés disponibles : " +
        keyList.join(", ");

      var helpClassic =
        "Tapez une clé de plan parmi : " +
        keyList.join(", ") +
        " — laissez vide pour ne pas modifier le plan.";

      var raw = window.prompt(
        opts.renewOnly ? helpRenew : helpClassic,
        opts.renewOnly ? String(opts.renewDefaultPrompt || RENEW_DEFAULT_PLAN_KEY) : "",
      );
      if (raw === null) {
        resolve(null);
        return;
      }
      var k = sanitizePlanKeyClient(raw);
      if (opts.renewOnly && !k) {
        resolve(null);
        return;
      }
      resolve(k);
    });
  }

  /**
   * @param {{ renewMode?: boolean, activateMode?: boolean, defaultPlanKey?: string }=} opts Sans argument : comportement équivalent au dialogue standard (liste classique avec « Ne pas modifier » ; pas de pré-sélection).
   */
  function openPlanPickDialog(opts) {
    opts = opts || {};
    var renewMode = !!opts.renewMode;
    var activateMode = !!opts.activateMode && !renewMode;
    var defaultPlanKeyRaw = opts.defaultPlanKey !== undefined ? String(opts.defaultPlanKey) : "";

    var dlg = document.getElementById("subs-plan-picker");
    var sel = document.getElementById("subs-plan-picker-select");
    if (!dlg || !sel || typeof dlg.showModal !== "function") {
      return fallbackPlanPickWithPrompt(
        renewMode ? { renewOnly: true, renewDefaultPrompt: defaultPlanKeyRaw || RENEW_DEFAULT_PLAN_KEY } : {},
      );
    }

    fillPlanChoiceSelect(sel, renewMode ? "picker-renew" : "picker");
    if (renewMode || activateMode) {
      applyDefaultPlanSelection(sel, defaultPlanKeyRaw || RENEW_DEFAULT_PLAN_KEY);
    }

    var okBtn = document.getElementById("subs-plan-picker-ok");
    var cancelBtn = document.getElementById("subs-plan-picker-cancel");
    var hintEl = document.getElementById("subs-plan-picker-hint");
    if (!okBtn || !cancelBtn) {
      return fallbackPlanPickWithPrompt(
        renewMode ? { renewOnly: true, renewDefaultPrompt: defaultPlanKeyRaw || RENEW_DEFAULT_PLAN_KEY } : {},
      );
    }

    var hintSaved = hintEl ? hintEl.innerHTML : "";
    var renewHintHtml =
      "La durée ajoutée (mois) et le montant CFA viennent du <strong>plan choisi</strong>. Par défaut : <strong>Basic</strong>, 3&nbsp;500 CFA, <strong>1 mois</strong> — vérifiable sous <strong>Paramètres</strong> → plans d’abonnement.";
    var activateHintHtml =
      "Si l’échéance est passée ou absente, elle est prolongée à partir d’aujourd’hui : la durée en <strong>jours</strong> et le <strong>montant CFA</strong> suivent le <strong>plan</strong> (≈ 30 j./mois du catalogue). <strong>Ne pas modifier le plan</strong> : prolongation standard de <strong>30&nbsp;j.</strong>, clé et tarif inchangés.";

    if (renewMode && hintEl) {
      hintEl.innerHTML = renewHintHtml;
    } else if (activateMode && hintEl) {
      hintEl.innerHTML = activateHintHtml;
    }

    return new Promise(function (resolve) {
      var NOTHING = {};
      var route = NOTHING;

      function restoreHintAndResolve(val) {
        if (hintEl) hintEl.innerHTML = hintSaved;
        resolve(val);
      }

      function onCloseDone() {
        dlg.removeEventListener("close", onCloseDone);
        if (route === NOTHING || route === false) restoreHintAndResolve(null);
        else restoreHintAndResolve(route);
      }

      dlg.addEventListener("close", onCloseDone);

      okBtn.onclick = function () {
        route = sanitizePlanKeyClient(sel.value);
        dlg.close();
      };

      cancelBtn.onclick = function () {
        route = false;
        dlg.close();
      };

      try {
        dlg.showModal();
      } catch (e) {
        dlg.removeEventListener("close", onCloseDone);
        if (hintEl) hintEl.innerHTML = hintSaved;
        fallbackPlanPickWithPrompt(
          renewMode ? { renewOnly: true, renewDefaultPrompt: defaultPlanKeyRaw || RENEW_DEFAULT_PLAN_KEY } : {},
        ).then(resolve);
      }
    });
  }

  function getApiBase() {
    var c = window.MenuGo_CONFIG || {};
    return String(c.API_URL || "").replace(/\/$/, "");
  }

  function formatCFA(n) {
    return Math.round(Number(n) || 0).toLocaleString("fr-FR") + " CFA";
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
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
    el.classList.remove("adm-banner--warning", "adm-banner--error");
  }

  function showAccessBanner(msg, variant) {
    var el = document.getElementById("adm-access-banner");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = false;
    el.classList.remove("adm-banner--warning", "adm-banner--error");
    el.classList.add(variant === "error" ? "adm-banner--error" : "adm-banner--warning");
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {}
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return "—";
    }
  }

  function labelStatus(s) {
    var z = String(s || "").toLowerCase();
    if (z === "active") return "Actif";
    if (z === "expired") return "Expiré";
    if (z === "suspended") return "Suspendu";
    return "Essai";
  }

  function statusBadge(st) {
    var z = String(st || "").toLowerCase().trim();
    var cls = "sub-badge sub-badge--trial";
    if (z === "active") cls = "sub-badge sub-badge--active";
    else if (z === "expired") cls = "sub-badge sub-badge--expired";
    else if (z === "suspended") cls = "sub-badge sub-badge--suspended";
    return '<span class="' + cls + '" role="status">' + escapeHtml(labelStatus(z)) + "</span>";
  }

  function daysCell(dr, st) {
    if (dr === null || dr === undefined) {
      return '<span class="subs-days subs-days--muted" title="Pas de date de fin définie">—</span>';
    }
    var n = Number(dr);
    var cls = "subs-days";
    if (st === "active" || st === "trial") {
      if (n <= 7) cls += " subs-days--warn";
    }
    if (st === "expired" || n <= 0) cls += " subs-days--muted";
    return '<span class="' + cls + '">' + escapeHtml(String(n)) + "</span>";
  }

  function canActivate(row) {
    var st = String(row.subscription_status || "").toLowerCase();
    var dr = row.days_remaining;
    if (st !== "active") return true;
    if (dr === null || dr === undefined) return true;
    return Number(dr) <= 0;
  }

  function canSuspend(row) {
    return String(row.subscription_status || "").toLowerCase() !== "suspended";
  }

  function buildButtons(row) {
    var id = encodeURIComponent(row.restaurant_id);
    var det =
      '<button type="button" class="adm-btn" data-act="detail" data-id="' + id + '">Voir détails</button>';
    var actDis = canActivate(row) ? "" : " disabled";
    var supDis = canSuspend(row) ? "" : " disabled";
    var act =
      '<button type="button" class="adm-btn adm-btn--primary" data-act="activate" data-id="' +
      id +
      '"' +
      actDis +
      ">Activer</button>";
    var sus =
      '<button type="button" class="adm-btn adm-btn--warn" data-act="suspend" data-id="' +
      id +
      '"' +
      supDis +
      ">Suspendre</button>";
    var ren =
      '<button type="button" class="adm-btn" data-act="renew" data-id="' + id + '">Renouveler</button>';
    return det + act + sus + ren;
  }

  async function fetchJson(method, path, token, opts) {
    opts = opts || {};
    var base = getApiBase();
    var headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };
    if (opts.body !== undefined && !opts.skipJsonHeaders) {
      headers["Content-Type"] = "application/json";
    }
    try {
      var res = await fetch(base + path, {
        method: method,
        headers: headers,
        body:
          opts.body !== undefined ?
            typeof opts.body === "string" ?
              opts.body
            : JSON.stringify(opts.body)
          : undefined,
      });
      var data = null;
      var text = "";
      try {
        text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = null;
      }
      return { ok: res.ok, status: res.status, data: data };
    } catch (e) {
      return { ok: false, status: 0, data: null };
    }
  }

  function renderPagination() {
    var nav = document.getElementById("subs-pagination");
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
    info.textContent = "Page " + page + " sur " + totalPages + " — " + state.total + " ligne(s)";
    nav.appendChild(info);

    function addBtn(label, disabled, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener("click", fn);
      nav.appendChild(b);
    }

    addBtn("Préc.", page <= 1, function () {
      if (state.page > 1) {
        state.page -= 1;
        loadSubscriptions();
      }
    });

    var win = 5;
    var start = Math.max(1, page - Math.floor(win / 2));
    var end = Math.min(totalPages, start + win - 1);
    if (end - start + 1 < win) start = Math.max(1, end - win + 1);

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
          loadSubscriptions();
        });
        nav.appendChild(b);
      })(i);
    }

    addBtn("Suiv.", page >= totalPages, function () {
      if (state.page < totalPages) {
        state.page += 1;
        loadSubscriptions();
      }
    });
  }

  function tbodyPlaceholder(m) {
    return '<tr class="adm-table__placeholder"><td colspan="9">' + escapeHtml(m) + "</td></tr>";
  }

  async function loadSubscriptions() {
    if (state.loading) return;

    state.loading = true;
    hideAccessBanner();

    var tbody = document.getElementById("subs-body");
    var cards = document.getElementById("subs-cards-list");
    var token = localStorage.getItem(TOKEN_KEY);
    var base = getApiBase();

    if (!base) {
      showAccessBanner("API non configurée (config.js → API_URL).", "error");
      if (tbody) tbody.innerHTML = tbodyPlaceholder("Configuration manquante.");
      state.loading = false;
      return;
    }

    if (tbody) tbody.innerHTML = tbodyPlaceholder("Chargement…");

    var qs =
      "?page=" +
      encodeURIComponent(String(state.page)) +
      "&pageSize=" +
      encodeURIComponent(String(PAGE_SIZE)) +
      "&status=" +
      encodeURIComponent(state.status) +
      (state.q ? "&q=" + encodeURIComponent(state.q) : "");

    var res = await fetchJson("GET", "/api/admin/subscriptions" + qs, token);
    state.loading = false;

    if (res.status === 401) {
      clearSessionAndRedirectLogin();
      return;
    }

    if (res.status === 403) {
      showAccessBanner(
        (res.data && res.data.message) || "Accès administration réservé (ADMIN_EMAILS).",
        "warning",
      );
      if (tbody) tbody.innerHTML = tbodyPlaceholder("Accès refusé.");
      if (cards) cards.innerHTML = "";
      var c = document.getElementById("subs-count-label");
      if (c) c.textContent = "";
      renderPagination();
      return;
    }

    if (!res.ok || !res.data || !Array.isArray(res.data.subscriptions)) {
      showAccessBanner("Impossible de charger les abonnements.", "error");
      if (tbody) tbody.innerHTML = tbodyPlaceholder("Erreur.");
      state.totalPages = 0;
      state.total = 0;
      renderPagination();
      return;
    }

    var list = res.data.subscriptions;
    if (Array.isArray(res.data.subscription_plans)) {
      plansCatalog = res.data.subscription_plans.slice(0, 12);
    }
    state.totalPages = Number(res.data.totalPages) || 0;
    state.total = Number(res.data.total) || 0;

    var lc = document.getElementById("subs-count-label");
    if (lc) lc.textContent = state.total + " abonnement(s)" + (state.q ? " — « " + state.q.trim() + " »" : "");

    if (state.totalPages > 0 && state.page > state.totalPages) {
      state.page = state.totalPages;
      state.loading = false;
      return loadSubscriptions();
    }

    if (!list.length) {
      if (tbody) tbody.innerHTML = tbodyPlaceholder("Aucun résultat pour ces filtres.");
      if (cards) cards.innerHTML = "";
      renderPagination();
      return;
    }

    if (tbody) {
      tbody.innerHTML = "";
      list.forEach(function (row) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          '<strong class="subs-name-strong">' +
          escapeHtml(row.name) +
          "</strong>" +
          '</td><td><span class="subs-plan-chip">' +
          escapeHtml(row.subscription_plan_label || "—") +
          '</span></td><td class="subs-col-email subs-email-muted">' +
          escapeHtml(row.owner_email || "") +
          "</td><td>" +
          escapeHtml(formatDate(row.subscription_started_at)) +
          "</td><td>" +
          escapeHtml(formatDate(row.subscription_ends_at)) +
          "</td><td>" +
          daysCell(row.days_remaining, row.subscription_status) +
          "</td><td><span class=\"subs-money\">" +
          escapeHtml(formatCFA(row.subscription_amount_cfa)) +
          "</span></td><td>" +
          statusBadge(row.subscription_status) +
          "</td><td><div class=\"subs-actions\">" +
          buildButtons(row) +
          "</div></td>";
        tbody.appendChild(tr);
      });
    }

    if (cards) {
      cards.innerHTML = "";
      list.forEach(function (row) {
        var li = document.createElement("li");
        li.className = "subs-card";
        li.innerHTML =
          '<div class="subs-card__meta">' +
          "<div>" +
          '<strong class="subs-name-strong">' +
          escapeHtml(row.name) +
          "</strong>" +
          '<div class="subs-email-muted subs-plan-chip">' +
          escapeHtml(row.subscription_plan_label || "—") +
          '</div>' +
          '<div class="subs-email-muted">' +
          escapeHtml(row.owner_email || "") +
          "</div>" +
          "</div>" +
          statusBadge(row.subscription_status) +
          "</div>" +
          '<div class="subs-email-muted">' +
          "Début : " +
          escapeHtml(formatDate(row.subscription_started_at)) +
          " · Fin : " +
          escapeHtml(formatDate(row.subscription_ends_at)) +
          "</div>" +
          '<div style="margin-top:6px" class="subs-money">' +
          escapeHtml(formatCFA(row.subscription_amount_cfa)) +
          "</div>" +
          '<div style="margin-top:4px">' +
          "Jours restants : " +
          daysCell(row.days_remaining, row.subscription_status) +
          "</div>" +
          '<div class="subs-actions subs-actions--card" style="margin-top:10px">' +
          buildButtons(row) +
          "</div>";
        cards.appendChild(li);
      });
    }

    renderPagination();
  }

  function initShell() {
    var body = document.body;
    var btn = document.getElementById("adm-open-sidebar");
    var sidebar = document.getElementById("adm-sidebar-panel");
    var overlay = document.getElementById("adm-overlay");

    function close() {
      body.classList.remove("adm-sidebar-open");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (overlay) {
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
      }
    }

    if (btn && sidebar) {
      btn.addEventListener("click", function () {
        var o = body.classList.toggle("adm-sidebar-open");
        btn.setAttribute("aria-expanded", o ? "true" : "false");
        if (overlay) {
          overlay.classList.toggle("is-visible", o);
          overlay.setAttribute("aria-hidden", o ? "false" : "true");
        }
      });
    }

    if (overlay) overlay.addEventListener("click", close);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    window.addEventListener(
      "resize",
      function () {
        if (window.matchMedia("(min-width: 901px)").matches) close();
      },
      { passive: true },
    );
  }

  var debTimer = null;
  function schedule() {
    if (debTimer) clearTimeout(debTimer);
    debTimer = setTimeout(function () {
      debTimer = null;
      state.page = 1;
      loadSubscriptions();
    }, DEBOUNCE_MS);
  }

  function setModal(open) {
    var m = document.getElementById("adm-subs-detail-modal");
    if (!m) return;
    m.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("adm-overlay-open", open);
  }

  function bindModal() {
    var m = document.getElementById("adm-subs-detail-modal");
    if (!m) return;
    m.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function () {
        setModal(false);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && m.getAttribute("aria-hidden") === "false") setModal(false);
    });
  }

  async function openDetail(idStr) {
    var token = localStorage.getItem(TOKEN_KEY);
    modalRestaurantId = idStr;
    setModal(true);
    document.getElementById("adm-subs-detail-title").textContent = "Chargement…";

    var res = await fetchJson(
      "GET",
      "/api/admin/subscriptions/" + encodeURIComponent(idStr),
      token,
    );

    if (res.status === 401) {
      clearSessionAndRedirectLogin();
      return;
    }

    if (res.status === 403 || !res.ok || !res.data || !res.data.subscription) {
      setModal(false);
      showAccessBanner((res.data && res.data.message) || "Détail indisponible.", "warning");
      return;
    }

    var s = res.data.subscription;

    if (Array.isArray(res.data.subscription_plans)) {
      plansCatalog = res.data.subscription_plans.slice(0, 12);
    }

    document.getElementById("adm-subs-detail-title").textContent = s.name || "Restaurant";

    var own = document.getElementById("adm-subs-detail-owner");
    if (own) {
      own.textContent = s.owner_email || "";
      own.className = "subs-email-muted";
      own.style.marginTop = "0";
    }

    document.getElementById("subs-d-id").textContent = String(s.restaurant_id);
    document.getElementById("subs-d-city").textContent = s.quartier || s.city || "—";
    var planDdEl = document.getElementById("subs-d-plan");
    if (planDdEl) planDdEl.textContent = s.subscription_plan_label || "—";

    adjustInitialPlanKey = s.subscription_plan_key ? String(s.subscription_plan_key).trim().toLowerCase() : "";

    document.getElementById("subs-d-start").textContent = formatDate(s.subscription_started_at);
    document.getElementById("subs-d-end").textContent = formatDate(s.subscription_ends_at);
    document.getElementById("subs-d-days").innerHTML =
      s.days_remaining === null || s.days_remaining === undefined ?
        "—"
      : escapeHtml(String(s.days_remaining));
    document.getElementById("subs-d-amount").textContent = formatCFA(s.subscription_amount_cfa);
    document.getElementById("subs-d-status").innerHTML = statusBadge(s.subscription_status);
    document.getElementById("subs-d-menu").textContent = s.menu_suspended ? "Menu suspendu" : "Menu en ligne";
    document.getElementById("subs-d-products").textContent = String(s.product_count ?? "0");

    document.getElementById("subs-d-created").textContent = formatDate(s.restaurant_created_at);

    var dsc = document.getElementById("subs-d-desc");
    var txt = String(s.description || "").trim();
    if (txt && dsc) {
      dsc.textContent = txt;
      dsc.hidden = false;
    } else if (dsc) {
      dsc.hidden = true;
    }

    var adjBox = document.getElementById("subs-adjust-box");
    var dAdj = document.getElementById("subs-adj-date");
    var addAdj = document.getElementById("subs-adj-add-days");
    if (adjBox) adjBox.removeAttribute("hidden");
    if (dAdj) dAdj.value = "";
    if (addAdj) addAdj.value = "";
    refillAdjustPlanSelect(s.subscription_plan_key);
  }

  async function submitSubscriptionAdjust() {
    var idStr = modalRestaurantId;
    if (!idStr) return;

    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      clearSessionAndRedirectLogin();
      return;
    }

    var dEl = document.getElementById("subs-adj-date");
    var addEl = document.getElementById("subs-adj-add-days");
    var pkEl = document.getElementById("subs-adj-plan-key");

    var dateStr = dEl && dEl.value ? String(dEl.value).trim() : "";
    var addRaw = addEl ? String(addEl.value || "").trim() : "";
    var addNum = Number(addRaw);

    var hasDt = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStr);
    var hasAdd = addRaw !== "" && Number.isFinite(addNum) && addNum !== 0;

    if (hasDt && hasAdd) {
      showAccessBanner("Choisissez soit une date de fin, soit une valeur en jours — pas les deux.", "error");
      return;
    }

    var body = {};
    if (hasDt) body.subscription_ends_at = dateStr;
    else if (hasAdd) body.add_days = Math.round(addNum);

    var initialPk = adjustInitialPlanKey ? String(adjustInitialPlanKey).trim().toLowerCase() : "";
    if (pkEl) {
      var cleaned = sanitizePlanKeyClient(pkEl.value);
      var currentNorm = cleaned;
      var initialNorm = sanitizePlanKeyClient(initialPk);
      if (currentNorm !== initialNorm) {
        body.subscription_plan_key = cleaned === "" ? null : cleaned;
      }
    }

    if (!Object.keys(body).length) {
      showAccessBanner("Modifiez au moins un champ avant d’enregistrer.", "warning");
      return;
    }

    var res = await fetchJson(
      "PATCH",
      "/api/admin/subscriptions/" + encodeURIComponent(idStr) + "/adjust",
      token,
      { body: body },
    );

    if (res.status === 401) clearSessionAndRedirectLogin();
    else if (!res.ok)
      showAccessBanner((res.data && res.data.message) || "Ajustement impossible.", "error");
    else {
      hideAccessBanner();
      setModal(false);
      await loadSubscriptions();
    }
  }

  function promptOptionalAmount() {
    var raw = prompt("Montant CFA / période (laisser vide pour ne pas modifier) :");
    if (raw === null) return "__cancel";
    raw = String(raw).trim().replace(/\s/g, "").replace(",", ".");
    if (raw === "") return undefined;
    var n = Math.round(Number(raw));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  async function activateRow(idStr) {
    var pkPick = await openPlanPickDialog({
      activateMode: true,
      defaultPlanKey: RENEW_DEFAULT_PLAN_KEY,
    });
    if (pkPick === null) return;

    var pk = sanitizePlanKeyClient(pkPick);
    var DEFAULT_ACTIVATE_DAYS = 30;
    var body = { period_days: DEFAULT_ACTIVATE_DAYS };

    if (pk !== "") {
      if (pk === "trial") {
        body.period_days = DEFAULT_ACTIVATE_DAYS;
        body.subscription_plan_key = pk;
      } else {
        var matched = plansCatalog.find(function (p) {
          return sanitizePlanKeyClient(p.id) === pk;
        });
        if (matched) {
          body.period_days = monthsToApproxPeriodDays(matched.months);
          body.subscription_plan_key = pk;
          var price = Math.round(Number(matched.price_cfa) || 0);
          if (Number.isFinite(price) && price >= 0) body.subscription_amount_cfa = price;
        } else {
          var dRaw = window.prompt(
            "Durée en jours à ajouter depuis aujourd’hui si l’échéance doit être mise à jour (clé « " +
              pk +
              " » absente du catalogue chargé — rafraîchissez la page ou Paramètres).",
            String(DEFAULT_ACTIVATE_DAYS),
          );
          if (dRaw === null) return;
          var pdManual = parseInt(dRaw, 10);
          if (!Number.isInteger(pdManual) || pdManual < 1) pdManual = DEFAULT_ACTIVATE_DAYS;
          if (pdManual > 3650) pdManual = 3650;
          body.period_days = pdManual;
          body.subscription_plan_key = pk;
          var manualAmt = promptOptionalAmount();
          if (manualAmt === "__cancel") return;
          if (manualAmt !== undefined) body.subscription_amount_cfa = manualAmt;
        }
      }
    }

    var token = localStorage.getItem(TOKEN_KEY);

    var res = await fetchJson(
      "POST",
      "/api/admin/subscriptions/" + encodeURIComponent(idStr) + "/activate",
      token,
      { body: body },
    );

    if (res.status === 401) clearSessionAndRedirectLogin();
    else if (!res.ok)
      showAccessBanner((res.data && res.data.message) || "Activation impossible.", "error");
    else {
      hideAccessBanner();
      await loadSubscriptions();
    }
  }

  async function suspendRow(idStr) {
    if (
      !confirm(
        "Mettre cet abonnement en statut « suspendu » ? Le champ statut passe à suspendu.",
      )
    ) {
      return;
    }

    var token = localStorage.getItem(TOKEN_KEY);
    var res = await fetchJson(
      "POST",
      "/api/admin/subscriptions/" + encodeURIComponent(idStr) + "/suspend",
      token,
      { body: {} },
    );

    if (res.status === 401) clearSessionAndRedirectLogin();
    else if (!res.ok)
      showAccessBanner((res.data && res.data.message) || "Suspension impossible.", "error");
    else {
      hideAccessBanner();
      await loadSubscriptions();
    }
  }

  async function renewRow(idStr) {
    var pkPick = await openPlanPickDialog({
      renewMode: true,
      defaultPlanKey: RENEW_DEFAULT_PLAN_KEY,
    });
    if (pkPick === null) return;

    var pk = sanitizePlanKeyClient(pkPick);
    var body = { months: 12 };

    if (pk === "trial") {
      body.months = 1;
      body.subscription_plan_key = pk;
    } else {
      var matched = plansCatalog.find(function (p) {
        return sanitizePlanKeyClient(p.id) === pk;
      });
      if (matched) {
        var mo = Math.round(Number(matched.months) || 1);
        if (!Number.isInteger(mo) || mo < 1) mo = 1;
        if (mo > 120) mo = 120;
        body.months = mo;
        body.subscription_plan_key = pk;
        var price = Math.round(Number(matched.price_cfa) || 0);
        if (Number.isFinite(price) && price >= 0) body.subscription_amount_cfa = price;
      } else {
        var mRaw = window.prompt(
          "Durée à ajouter en mois. La clé « " +
            pk +
            " » est introuvable dans le catalogue chargé — rafraîchissez la page ou vérifiez Paramètres → plans d'abonnement.",
          "1",
        );
        if (mRaw === null) return;
        var monthsManual = parseInt(mRaw, 10);
        if (!Number.isInteger(monthsManual) || monthsManual < 1) monthsManual = 1;
        if (monthsManual > 120) monthsManual = 120;
        body.months = monthsManual;
        body.subscription_plan_key = pk;
        var manualAmt = promptOptionalAmount();
        if (manualAmt === "__cancel") return;
        if (manualAmt !== undefined) body.subscription_amount_cfa = manualAmt;
      }
    }

    var token = localStorage.getItem(TOKEN_KEY);
    var res = await fetchJson(
      "POST",
      "/api/admin/subscriptions/" + encodeURIComponent(idStr) + "/renew",
      token,
      { body: body },
    );

    if (res.status === 401) clearSessionAndRedirectLogin();
    else if (!res.ok)
      showAccessBanner((res.data && res.data.message) || "Renouvellement impossible.", "error");
    else {
      hideAccessBanner();
      await loadSubscriptions();
    }
  }

  function attachHandlers() {
    document.getElementById("subs-q").addEventListener("input", function () {
      state.q = String(document.getElementById("subs-q").value || "")
        .trim()
        .slice(0, 160);
      schedule();
    });

    document.getElementById("subs-q").addEventListener("search", function () {
      state.q = String(document.getElementById("subs-q").value || "")
        .trim()
        .slice(0, 160);
      state.page = 1;
      loadSubscriptions();
    });

    document.getElementById("subs-status-filter").addEventListener("change", function () {
      state.status = String(document.getElementById("subs-status-filter").value || "all").toLowerCase();
      state.page = 1;
      loadSubscriptions();
    });

    var adjSendBtn = document.getElementById("subs-adj-send");
    if (adjSendBtn) {
      adjSendBtn.addEventListener("click", function () {
        submitSubscriptionAdjust();
      });
    }

    var panel = document.getElementById("adm-subs-panel");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]");
      if (!b || b.disabled || !panel.contains(b)) return;

      var tb = document.getElementById("subs-body");
      var ul = document.getElementById("subs-cards-list");
      if ((!tb || !tb.contains(b)) && (!ul || !ul.contains(b))) return;

      var id = b.getAttribute("data-id");
      var act = b.getAttribute("data-act");
      if (!id || !act) return;
      e.preventDefault();

      if (act === "detail") openDetail(id);
      else if (act === "activate") activateRow(id);
      else if (act === "suspend") suspendRow(id);
      else if (act === "renew") renewRow(id);
    });
  }

  function init() {
    if (!requireAuthToken()) return;
    initShell();
    attachHandlers();
    bindModal();
    loadSubscriptions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
