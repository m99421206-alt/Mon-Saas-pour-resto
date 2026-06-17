(function () {

  "use strict";



  var TOKEN_KEY = "MenuGo_token";

  var USER_KEY = "MenuGo_user";

  var RESTAURANT_KEY = "MenuGo_restaurant";

  var LOGIN_NEXT = "admin-settings.html";

  function guardApiStatus(status) {
    return window.MenuGo_AdminGuard.handleAdminApiStatus(status, { loginNext: LOGIN_NEXT });
  }



  function getApiBase() {

    var c = window.MenuGo_CONFIG || {};

    return String(c.API_URL || "").replace(/\/$/, "");

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



  function hideAccessBanner() {

    var el = document.getElementById("adm-access-banner");

    if (!el) return;

    el.textContent = "";

    el.hidden = true;

    el.classList.remove("adm-banner--warning", "adm-banner--error");

  }



  function showSnack(message, variant) {

    var s = document.getElementById("sett-snackbar");

    if (!s) return;

    s.textContent = message || "";

    s.hidden = false;

    s.setAttribute("data-variant", variant === "error" ? "error" : "success");

    s.classList.add("is-visible");

    window.clearTimeout(showSnack._t);

    showSnack._t = window.setTimeout(function () {

      s.classList.remove("is-visible");

      window.setTimeout(function () {

        s.hidden = true;

      }, 400);

    }, 3800);

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

      var response = await fetch(base + path, {

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

        text = await response.text();

        data = text ? JSON.parse(text) : null;

      } catch (e) {

        data = null;

      }



      return { ok: response.ok, status: response.status, data: data };

    } catch (e) {

      return { ok: false, status: 0, data: null };

    }

  }



  function renderPlans(plans) {

    var tbody = document.getElementById("sett-plan-rows");

    if (!tbody) return;

    tbody.innerHTML = "";



    var list =

      Array.isArray(plans) && plans.length ?

        plans.slice(0, 12)

      : [

          {

            id: "starter",

            name: "Starter",

            price_cfa: 0,

            months: 1,

          },

        ];



    list.forEach(function (row) {

      var tr = document.createElement("tr");

      tr.innerHTML =

        "<td><input type=\"text\" data-field=\"id\" maxlength=\"48\" autocomplete=\"off\" /></td>" +

        "<td><input type=\"text\" data-field=\"name\" maxlength=\"120\" autocomplete=\"off\" /></td>" +

        "<td><input type=\"number\" data-field=\"price_cfa\" min=\"0\" step=\"1\" autocomplete=\"off\" /></td>" +

        "<td><input type=\"number\" data-field=\"months\" min=\"1\" step=\"1\" autocomplete=\"off\" /></td>" +

        "<td><button type=\"button\" class=\"plan-remove-btn\" aria-label=\"Supprimer ligne\" title=\"Supprimer\">×</button></td>";



      tr.querySelector("[data-field='id']").value = String(row.id || "");

      tr.querySelector("[data-field='name']").value = String(row.name || "");

      tr.querySelector("[data-field='price_cfa']").value = String(row.price_cfa != null ? row.price_cfa : 0);

      tr.querySelector("[data-field='months']").value = String(row.months != null ? row.months : 1);



      tr.querySelector(".plan-remove-btn").addEventListener("click", function () {

        var rows = tbody.querySelectorAll("tr");

        if (rows.length <= 1) {

          showSnack("Au moins un plan est nécessaire.", "error");

          return;

        }

        tr.remove();

      });



      tbody.appendChild(tr);

    });

  }



  function collectPlans() {

    var tbody = document.getElementById("sett-plan-rows");

    if (!tbody) return [];

    var rows = tbody.querySelectorAll("tr");

    var out = [];

    rows.forEach(function (tr) {

      out.push({

        id: String(tr.querySelector("[data-field='id']").value || "").trim(),

        name: String(tr.querySelector("[data-field='name']").value || "").trim(),

        price_cfa: Math.round(Number(tr.querySelector("[data-field='price_cfa']").value) || 0),

        months: Math.round(Number(tr.querySelector("[data-field='months']").value) || 1),

      });

    });

    return out.filter(function (p) {

      return p.id !== "" || p.name !== "";

    });

  }



  async function putSettings(patch) {

    var token = localStorage.getItem(TOKEN_KEY);

    hideAccessBanner();

    var res = await fetchJson("PUT", "/api/admin/settings", token, {

      body: patch,

    });



    if (guardApiStatus(res.status)) {
      return null;
    }

    if (!res.ok) {
      var msg = (res.data && res.data.message) || "Enregistrement impossible.";
      showAccessBanner(msg, "error");
      showSnack(msg, "error");
      return null;
    }



    showSnack("Paramètres enregistrés.", "success");

    return res.data.settings || null;

  }



  function applySnap(snap) {

    if (!snap) return;



    document.getElementById("sett-maint-checkbox").checked = Boolean(

      snap.maintenance_mode === true || snap.maintenance_mode === "1",

    );



    renderPlans(snap.subscription_plans);



    var td = Number(snap.trial_period_days);

    if (!Number.isFinite(td)) td = 30;

    document.getElementById("sett-trial-days").value = String(Math.min(365, Math.max(1, Math.round(td))));



    var upl = Number(snap.upload_max_mb);

    if (!Number.isFinite(upl)) upl = 5;

    document.getElementById("sett-upload-max").value = String(Math.min(64, Math.max(1, Math.round(upl))));



    hideAccessBanner();

  }



  async function loadInitial() {

    var token = localStorage.getItem(TOKEN_KEY);

    hideAccessBanner();

    var res = await fetchJson("GET", "/api/admin/settings", token);



    if (guardApiStatus(res.status)) {
      return;
    }

    if (!res.ok || !res.data) {
      showAccessBanner(
        (res.data && res.data.message) || "Impossible de charger les réglages.",
        "error",
      );
      return;
    }



    applySnap(res.data);

  }



  function initShell() {

    var body = document.body;

    var btn = document.getElementById("adm-open-sidebar");

    var sidebar = document.getElementById("adm-sidebar-panel");

    var overlay = document.getElementById("adm-overlay");



    function closeSidebar() {

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

    if (overlay) overlay.addEventListener("click", closeSidebar);



    document.addEventListener("keydown", function (e) {

      if (e.key === "Escape") closeSidebar();

    });



    window.addEventListener(

      "resize",

      function () {

        if (window.matchMedia("(min-width: 901px)").matches) closeSidebar();

      },

      { passive: true },

    );

  }



  function attachHandlers() {

    document.getElementById("sett-reload").addEventListener("click", function () {

      loadInitial();

    });



    document.getElementById("sett-save-maint").addEventListener("click", async function () {

      var chk = document.getElementById("sett-maint-checkbox");

      var patch = {

        maintenance_mode: Boolean(chk && chk.checked),

      };

      var next = await putSettings(patch);

      if (next) applySnap(next);

    });



    document.getElementById("sett-save-plans").addEventListener("click", async function () {

      var patch = {

        subscription_plans: collectPlans(),

      };

      var next = await putSettings(patch);

      if (next) applySnap(next);

    });



    document.getElementById("sett-save-trial").addEventListener("click", async function () {

      var n = Math.round(Number(document.getElementById("sett-trial-days").value));

      var patch = {

        trial_period_days: Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : 30,

      };

      var next = await putSettings(patch);

      if (next) applySnap(next);

    });



    document.getElementById("sett-add-plan").addEventListener("click", function () {

      var tbody = document.getElementById("sett-plan-rows");

      if (!tbody) return;

      if (tbody.querySelectorAll("tr").length >= 12) {

        showSnack("Maximum 12 plans.", "error");

        return;

      }

      renderPlans(

        collectPlans().concat([

          {

            id: "plan_" + Date.now(),

            name: "Nouveau plan",

            price_cfa: 0,

            months: 1,

          },

        ]),

      );

      showSnack("Ligne ajoutée — sauvegardez.", "success");

    });



    document.getElementById("sett-save-upload").addEventListener("click", async function () {

      var n = Math.round(Number(document.getElementById("sett-upload-max").value));

      var patch = {

        upload_max_mb: Number.isFinite(n) ? Math.min(64, Math.max(1, n)) : 5,

      };

      var next = await putSettings(patch);

      if (next) applySnap(next);

    });

  }



  async function init() {

    var allowed = await window.MenuGo_AdminGuard.enforceAdminAccess({ loginNext: LOGIN_NEXT });

    if (!allowed) return;

    if (!getApiBase()) {

      showAccessBanner("API_URL manquant dans config.js.", "error");

      return;

    }

    initShell();

    attachHandlers();

    await loadInitial();

  }



  if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

  } else {

    init();

  }

})();

