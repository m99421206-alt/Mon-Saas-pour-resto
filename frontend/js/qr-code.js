/**
 * Page « Votre QR Code »
 * - Génère le QR depuis le lien public du menu
 * - Téléchargement PNG du canvas
 * - Copie du lien partageable dans le presse-papiers
 */
(function () {
  "use strict";

  var API_URL = window.MenuGo_CONFIG.API_URL;
  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";

  var canvas = document.getElementById("qr-code-canvas");
  var downloadBtn = document.getElementById("qr-code-download");
  var copyBtn = document.getElementById("qr-copy-btn");
  var urlInput = document.getElementById("qr-share-url");
  var feedback = document.getElementById("qr-copy-feedback");
  var nameEl = document.getElementById("qr-restaurant-name");
  var drawerRestaurant = document.getElementById("qr-drawer-restaurant");
  var drawerEmail = document.getElementById("qr-drawer-email");
  var logoutLink = document.getElementById("qr-logout");

  var currentRestaurant = null;
  var currentShareUrl = "";

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  function getStoredJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (error) {
      return null;
    }
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  async function loadMe() {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    var response = await fetch(API_URL + "/api/me", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });
    var data = await readJson(response);

    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      return null;
    }
    if (!response.ok) {
      throw new Error(data.message || "Impossible de charger le restaurant.");
    }

    localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
    localStorage.setItem(
      RESTAURANT_KEY,
      JSON.stringify(data.restaurant || null),
    );
    return data;
  }

  function resolvePublicSiteOrigin() {
    var cfg = window.MenuGo_CONFIG || {};
    var raw =
      typeof cfg.PUBLIC_SITE_ORIGIN === "string" ? cfg.PUBLIC_SITE_ORIGIN.trim().replace(/\/+$/, "") : "";
    return raw.length ? raw : window.location.origin;
  }

  function buildPublicMenuUrl(restaurantId) {
    var currentPath = window.location.pathname;
    var menuPath = currentPath.replace(/qr-code\.html$/, "mon-menu.html");
    return (
      resolvePublicSiteOrigin() + menuPath + "?id=" + encodeURIComponent(restaurantId)
    );
  }

  function updateAccountInfo(user, restaurant) {
    var restaurantName =
      restaurant && restaurant.name ? restaurant.name : "Nom du resto";
    if (nameEl) nameEl.textContent = restaurantName;
    if (drawerRestaurant) drawerRestaurant.textContent = restaurantName;
    if (drawerEmail)
      drawerEmail.textContent =
        user && user.email ? user.email : "email du resto";
    if (window.MenuGo_DashShell) {
      window.MenuGo_DashShell.populateProfile(user, restaurant);
    }
  }

  function drawFallbackQr(ctx, size) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("QR indisponible", size / 2, size / 2 - 8);
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText("Copiez le lien ci-dessous", size / 2, size / 2 + 14);
  }

  function renderQrCode(url) {
    if (!canvas) return;
    var display = 220;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(display * dpr);
    canvas.height = Math.round(display * dpr);
    canvas.style.width = display + "px";
    canvas.style.height = display + "px";
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, display, display);
      ctx.drawImage(img, 0, 0, display, display);
    };
    img.onerror = function () {
      drawFallbackQr(ctx, display);
    };
    img.src =
      "https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=16&data=" +
      encodeURIComponent(url);
  }

  function downloadPng() {
    if (!canvas) return;
    try {
      var link = document.createElement("a");
      var id =
        currentRestaurant && currentRestaurant.id
          ? currentRestaurant.id
          : "menu";
      link.download = "qrcode-MenuGo-" + id + ".png";
      link.href = canvas.toDataURL("image/png");
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      window.open(
        "https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=16&data=" +
          encodeURIComponent(currentShareUrl),
        "_blank",
        "noopener",
      );
    }
  }

  function setCopyFeedback(msg, ok) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.hidden = false;
    feedback.classList.toggle("qr-copy-feedback--ok", !!ok);
    window.setTimeout(function () {
      feedback.hidden = true;
      feedback.textContent = "";
    }, 2200);
  }

  function copyUrl() {
    if (!urlInput) return;
    var text = urlInput.value || currentShareUrl;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          setCopyFeedback("Lien copié dans le presse-papiers.", true);
          if (copyBtn) copyBtn.classList.add("is-done");
          window.setTimeout(function () {
            if (copyBtn) copyBtn.classList.remove("is-done");
          }, 2000);
        },
        function () {
          urlInput.select();
          document.execCommand("copy");
          setCopyFeedback("Lien copié.", true);
        },
      );
    } else {
      urlInput.select();
      document.execCommand("copy");
      setCopyFeedback("Lien copié.", true);
    }
  }

  async function init() {
    var storedRestaurant = null;
    try {
      var cfg = window.MenuGo_CONFIG || {};
      var pub = typeof cfg.PUBLIC_SITE_ORIGIN === "string" ? cfg.PUBLIC_SITE_ORIGIN.trim() : "";
      var host = String(window.location.hostname || "").toLowerCase();
      var warnEl = document.getElementById("qr-phone-scan-warning");
      if (
        warnEl &&
        !pub &&
        (host === "127.0.0.1" || host === "localhost" || host === "::1")
      ) {
        warnEl.hidden = false;
      }

      var storedUser = getStoredJson(USER_KEY);
      storedRestaurant = getStoredJson(RESTAURANT_KEY);
      updateAccountInfo(storedUser, storedRestaurant);

      var data = await loadMe();
      if (!data || !data.restaurant) return;

      currentRestaurant = data.restaurant;
      currentShareUrl = buildPublicMenuUrl(data.restaurant.id);
      updateAccountInfo(data.user, data.restaurant);

      if (urlInput) {
        urlInput.value = currentShareUrl;
      }
      renderQrCode(currentShareUrl);
    } catch (error) {
      setCopyFeedback(
        error.message || "Impossible de générer le QR code.",
        false,
      );
      if (storedRestaurant && storedRestaurant.id) {
        currentRestaurant = storedRestaurant;
        currentShareUrl = buildPublicMenuUrl(storedRestaurant.id);
        if (urlInput) urlInput.value = currentShareUrl;
        renderQrCode(currentShareUrl);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadPng);
  }
  if (copyBtn) {
    copyBtn.addEventListener("click", copyUrl);
  }
  if (logoutLink) {
    logoutLink.addEventListener("click", clearSession);
  }
})();
