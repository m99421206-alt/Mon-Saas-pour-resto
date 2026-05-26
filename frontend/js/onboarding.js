/**
 * Onboarding — première connexion : marque la page vue, actions WhatsApp / aide / dashboard.
 */
(function () {
  "use strict";

  var API_URL = String((window.AFRICAMENU_CONFIG && window.AFRICAMENU_CONFIG.API_URL) || "").replace(
    /\/$/,
    "",
  );
  var TOKEN_KEY = "africamenu_token";
  var USER_KEY = "africamenu_user";
  var RESTAURANT_KEY = "africamenu_restaurant";
  var DEFAULT_SUPPORT_WA = "22399421206";

  var waBtn = document.getElementById("onb-btn-wa");
  var helpBtn = document.getElementById("onb-btn-help");
  var soloBtn = document.getElementById("onb-btn-solo");
  var feedback = document.getElementById("onb-feedback");

  function redirectLogin() {
    window.location.href = "login.html?next=" + encodeURIComponent("onboarding.html");
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function patchStoredRestaurant(partial) {
    try {
      var raw = localStorage.getItem(RESTAURANT_KEY);
      var r = raw ? JSON.parse(raw) : {};
      if (!r || typeof r !== "object") r = {};
      Object.keys(partial).forEach(function (k) {
        r[k] = partial[k];
      });
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(r));
    } catch (e) {}
  }

  function supportDigits() {
    var cfg = window.AFRICAMENU_CONFIG || {};
    var w = typeof cfg.SUPPORT_WHATSAPP === "string" ? cfg.SUPPORT_WHATSAPP.trim() : "";
    var d = w.replace(/\D/g, "");
    return d || DEFAULT_SUPPORT_WA;
  }

  function wireWhatsAppLink() {
    if (!waBtn) return;
    var body = waBtn.getAttribute("data-wa-body") || "";
    var url =
      "https://wa.me/" + supportDigits() + "?text=" + encodeURIComponent(String(body).trim());
    waBtn.setAttribute("href", url);
  }

  function showFeedback(msg, kind) {
    if (!feedback) return;
    feedback.textContent = msg || "";
    feedback.hidden = !msg;
    feedback.classList.remove("onb-feedback--ok", "onb-feedback--err");
    if (kind === "ok") feedback.classList.add("onb-feedback--ok");
    if (kind === "err") feedback.classList.add("onb-feedback--err");
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (e) {
      return {};
    }
  }

  async function apiPost(path) {
    var token = getToken();
    if (!token) return { ok: false, status: 401, data: null };

    var response = await fetch(API_URL + path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    });

    var data = await readJson(response);
    return { ok: response.ok, status: response.status, data: data };
  }

  async function markSeen() {
    var res = await apiPost("/api/me/onboarding/mark-seen");
    if (res.ok && res.data) {
      patchStoredRestaurant({ onboarding_seen: true });
    }
    return res;
  }

  function goDashboard() {
    window.location.href = "dashboard.html";
  }

  async function init() {
    if (!getToken()) {
      redirectLogin();
      return;
    }

    wireWhatsAppLink();

    var seenRes = await markSeen();
    if (seenRes.status === 401) {
      redirectLogin();
      return;
    }
    if (!seenRes.ok) {
      showFeedback(
        (seenRes.data && seenRes.data.message) ||
          "Connexion incomplète. Rechargez la page ou reconnectez-vous.",
        "err",
      );
    }

    if (helpBtn) {
      helpBtn.addEventListener("click", async function () {
        helpBtn.disabled = true;
        showFeedback("");
        var res = await apiPost("/api/me/onboarding/request-help");
        if (res.status === 401) {
          redirectLogin();
          return;
        }
        if (res.ok) {
          patchStoredRestaurant({ onboarding_seen: true, needs_setup_help: true });
          showFeedback(
            "Votre demande a été envoyée avec succès. Notre équipe vous contactera rapidement.",
            "ok",
          );
        } else {
          showFeedback(
            (res.data && res.data.message) || "Impossible d’envoyer la demande. Réessayez.",
            "err",
          );
        }
        helpBtn.disabled = false;
      });
    }

    if (soloBtn) {
      soloBtn.addEventListener("click", function () {
        goDashboard();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
