/**
 * Dashboard MenuGo
 * - Drawer : ouverture / fermeture, overlay, Escape, aria-expanded
 * - Données : profil, restaurant, catégories et produits depuis l’API.
 */
(function () {
  "use strict";

  const API_URL = window.MenuGo_CONFIG.API_URL;
  const TOKEN_KEY = "MenuGo_token";
  const USER_KEY = "MenuGo_user";
  const RESTAURANT_KEY = "MenuGo_restaurant";
  const ADMIN_BACKUP_TOKEN = "MenuGo_admin_token";

  const openBtn = document.getElementById("open-drawer");
  const closeBtn = document.getElementById("close-drawer");
  const drawer = document.getElementById("dash-drawer");
  const overlay = document.getElementById("dash-overlay");
  const title = document.getElementById("dashboard-title");
  const categoriesCount = document.getElementById("dashboard-categories-count");
  const productsCount = document.getElementById("dashboard-products-count");
  const drawerRestaurant = document.getElementById("dashboard-drawer-restaurant");
  const drawerEmail = document.getElementById("dashboard-drawer-email");
  const menuUrlInput = document.getElementById("dashboard-menu-url");
  const copyMenuBtn = document.getElementById("dashboard-copy-menu");
  const copyFeedback = document.getElementById("dashboard-copy-feedback");
  const viewMenuBtn = document.getElementById("dashboard-view-menu");
  const logoutLink = document.getElementById("dashboard-logout");
  const addProductBtn = document.getElementById("dashboard-add-product");
  const addCategoryBtn = document.getElementById("dashboard-add-category");
  const trialExpiredBanner = document.getElementById("dash-trial-expired-banner");
  const trialExpiredWhatsApp = document.getElementById("dash-trial-expired-whatsapp");

  /** WhatsApp paiement/abonnement (Mali indicatif inclus) si non défini dans config */
  var DEFAULT_PAYMENT_WHATSAPP = "22399421206";

  const TRANSITION_MS = 320;
  let closeTimer = null;

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  function isAdminImpersonating() {
    try {
      return Boolean(sessionStorage.getItem(ADMIN_BACKUP_TOKEN));
    } catch (error) {
      return false;
    }
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  async function apiGet(path) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    const response = await fetch(API_URL + path, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await readJson(response);
    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      return null;
    }
    if (!response.ok) {
      throw new Error(data.message || "Erreur API");
    }
    return data;
  }

  function getStoredRestaurant() {
    try {
      return JSON.parse(localStorage.getItem(RESTAURANT_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function resolvePublicSiteOrigin() {
    var cfg = window.MenuGo_CONFIG || {};
    var raw =
      typeof cfg.PUBLIC_SITE_ORIGIN === "string" ? cfg.PUBLIC_SITE_ORIGIN.trim().replace(/\/+$/, "") : "";
    return raw.length ? raw : window.location.origin;
  }

  function buildPublicMenuUrl(restaurantId) {
    const currentPath = window.location.pathname;
    const menuPath = currentPath.replace(/dashboard\.html$/, "mon-menu.html");
    return resolvePublicSiteOrigin() + menuPath + "?id=" + encodeURIComponent(restaurantId);
  }

  function renderDashboardQrPreview(url) {
    var canvas = document.getElementById("dashboard-qr-preview");
    if (!canvas || !url) return;

    var display = 88;
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
      ctx.fillStyle = "#f4f4f5";
      ctx.fillRect(0, 0, display, display);
      ctx.fillStyle = "#757575";
      ctx.font = "600 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QR", display / 2, display / 2 + 3);
    };
    img.src =
      "https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=8&data=" +
      encodeURIComponent(url);
  }

  function whatsappDigitsDash(value) {
    return String(value || "").replace(/\D/g, "").replace(/^0+/, "");
  }

  /** Essai terminé ou abonnement à renouveler : afficher le CTA WhatsApp paiement. */
  function shouldShowTrialExpiredPaymentBanner(subscription) {
    if (!subscription) return false;
    var st = String(subscription.status || "").toLowerCase();
    if (st === "expired") return true;
    if (st !== "trial") return false;
    var dr = subscription.days_remaining;
    if (dr !== undefined && dr !== null && Number(dr) <= 0) return true;
    if (subscription.ends_at) {
      var endMs = new Date(subscription.ends_at).getTime();
      return Number.isFinite(endMs) && Date.now() > endMs;
    }
    return false;
  }

  /** Libellé « Plan » du message (priorité offre post-essai renvoyée par l’API). */
  function pickPlanLabelForWhatsApp(me) {
    var sub = (me && me.subscription) || {};
    var offer = sub.post_trial_offer;
    if (offer && String(offer.plan_label || "").trim()) {
      return String(offer.plan_label).trim();
    }
    var pl = String(sub.plan_label || "").trim();
    if (pl) {
      var low = pl.toLowerCase();
      if (low !== "essai gratuit" && low !== "trial") return pl;
    }
    return "Basic";
  }

  function buildTrialExpiredWhatsAppMessage(restaurantName, planLabel) {
    var rn = restaurantName ? String(restaurantName).trim() : "Mon restaurant";
    var pl = planLabel ? String(planLabel).trim() : "Basic";
    return (
      "Bonjour, je souhaite activer mon abonnement MenuGo.\n\n" +
      "Nom du restaurant : " +
      rn +
      "\n" +
      "Plan : " +
      pl +
      "\n"
    );
  }

  function updateTrialExpiredBanner(me) {
    if (!trialExpiredBanner || !trialExpiredWhatsApp) return;

    var sub = me.subscription;
    if (!shouldShowTrialExpiredPaymentBanner(sub)) {
      trialExpiredBanner.hidden = true;
      trialExpiredWhatsApp.setAttribute("href", "#");
      return;
    }

    var cfg = window.MenuGo_CONFIG || {};
    var digits = whatsappDigitsDash(cfg.SUPPORT_WHATSAPP) || DEFAULT_PAYMENT_WHATSAPP;
    var rest = me.restaurant || getStoredRestaurant();
    var restName =
      rest && rest.name ?
        rest.name
      : "Mon restaurant";

    trialExpiredBanner.hidden = false;
    trialExpiredWhatsApp.setAttribute(
      "href",
      "https://wa.me/" +
        digits +
        "?text=" +
        encodeURIComponent(
          buildTrialExpiredWhatsAppMessage(restName, pickPlanLabelForWhatsApp(me)),
        ),
    );

    var titleEl = document.getElementById("dash-trial-expired-title");
    var subtitleEl = document.getElementById("dash-trial-expired-subtitle");
    if (titleEl && sub) {
      var stLo = String(sub.status || "").toLowerCase();
      var pkLo = String(sub.plan_key || "").toLowerCase();
      var looksLikePaidExpired =
        stLo === "expired" &&
        pkLo &&
        pkLo !== "trial" &&
        pkLo !== "";
      titleEl.textContent = looksLikePaidExpired ?
        "Votre abonnement a expiré"
      : "Votre période d’essai a expiré";
    }
    if (subtitleEl) {
      subtitleEl.textContent =
        "Cliquez sur le bouton ci-dessous : WhatsApp s’ouvre avec votre message prérempli pour activer votre abonnement.";
    }
  }

  function applyDashboardEditLocks(subscription) {
    var locked =
      subscription &&
      Object.prototype.hasOwnProperty.call(subscription, "can_edit_menu") &&
      subscription.can_edit_menu === false;

    function setBtn(btn, label) {
      if (!btn) return;
      btn.disabled = Boolean(locked);
      btn.setAttribute(
        "title",
        locked ? "Edition du menu désactivée (abonnement). " + label : "",
      );
    }

    setBtn(
      addProductBtn,
      "Ouvrez la page « mon-abonnement.html » depuis le menu pour voir votre formule et les suites possibles.",
    );
    setBtn(
      addCategoryBtn,
      "Ouvrez la page « mon-abonnement.html » depuis le menu pour voir votre formule et les suites possibles.",
    );
  }

  function renderDashboard(me, categories, products) {
    const restaurant = me.restaurant || getStoredRestaurant();
    const user = me.user || {};
    const restaurantName = restaurant && restaurant.name ? restaurant.name : "votre restaurant";

    title.textContent = "Bonjour, " + restaurantName;
    drawerRestaurant.textContent = restaurantName;
    drawerEmail.textContent = user.email || "email du resto";
    categoriesCount.textContent = String(categories.length);
    productsCount.textContent = String(products.length);

    if (window.MenuGo_DashShell) {
      window.MenuGo_DashShell.populateProfile(user, restaurant);
    }

    applyDashboardEditLocks(me.subscription);

    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
    localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant || null));

    if (restaurant && restaurant.id) {
      const publicUrl = buildPublicMenuUrl(restaurant.id);
      document.body.setAttribute("data-menu-id", String(restaurant.id));
      menuUrlInput.value = publicUrl;
      viewMenuBtn.setAttribute("data-menu-url", publicUrl);
      renderDashboardQrPreview(publicUrl);
    }

    updateTrialExpiredBanner(me);
  }

  function setCopyFeedback(message, isError) {
    if (!copyFeedback) return;

    copyFeedback.textContent = message;
    copyFeedback.hidden = !message;
    copyFeedback.classList.toggle("is-error", Boolean(isError));

    window.setTimeout(function () {
      copyFeedback.hidden = true;
      copyFeedback.textContent = "";
      copyFeedback.classList.remove("is-error");
    }, 2200);
  }

  function copyMenuUrl() {
    const url = menuUrlInput ? menuUrlInput.value : "";
    if (!url) {
      setCopyFeedback("Lien indisponible pour le moment.", true);
      return;
    }

    function markCopied() {
      copyMenuBtn?.classList.add("is-done");
      var copyLabel = copyMenuBtn?.querySelector(".dash-copy-btn__label");
      if (copyLabel) copyLabel.textContent = "Copié !";
      setCopyFeedback("Lien copié.");
      window.setTimeout(function () {
        copyMenuBtn?.classList.remove("is-done");
        if (copyLabel) copyLabel.textContent = "Copier";
      }, 1800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(markCopied, function () {
        menuUrlInput.select();
        document.execCommand("copy");
        markCopied();
      });
      return;
    }

    menuUrlInput.select();
    document.execCommand("copy");
    markCopied();
  }

  async function loadDashboard() {
    if (!title || !categoriesCount || !productsCount || !menuUrlInput || !viewMenuBtn) {
      return;
    }

    try {
      const me = await apiGet("/api/me");
      if (!me) {
        return;
      }

      if (me.is_platform_admin) {
        window.location.replace("admin-dashboard.html");
        return;
      }

      if (!me.is_platform_admin && me.restaurant && me.restaurant.onboarding_seen === false) {
        if (!isAdminImpersonating()) {
          window.location.replace("onboarding.html");
          return;
        }
      }

      const [categoriesData, productsData] = await Promise.all([
        apiGet("/api/categories"),
        apiGet("/api/products"),
      ]);

      if (!categoriesData || !productsData) {
        return;
      }

      renderDashboard(me, categoriesData.categories || [], productsData.products || []);
    } catch (error) {
      title.textContent = "Impossible de charger le dashboard";
    }
  }

  function isOpen() {
    return drawer.classList.contains("is-open");
  }

  function isDesktopNav() {
    return window.MenuGo_DashShell && window.MenuGo_DashShell.isDesktop();
  }

  function openDrawer() {
    if (isDesktopNav()) return;
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    closeBtn.hidden = false;

    window.requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
      closeBtn.classList.add("is-visible");
    });

    openBtn?.setAttribute("aria-expanded", "true");
    openBtn?.classList.add("is-active");
    document.body.classList.add("dash-drawer-open");
    document.body.style.overflow = "hidden";

    closeBtn?.focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (isDesktopNav()) return;
    if (!isOpen()) return;

    overlay.classList.remove("is-visible");
    closeBtn.classList.remove("is-visible");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");

    openBtn?.setAttribute("aria-expanded", "false");
    openBtn?.classList.remove("is-active");
    document.body.classList.remove("dash-drawer-open");
    document.body.style.overflow = "";

    closeTimer = window.setTimeout(function () {
      if (!drawer.classList.contains("is-open")) {
        overlay.hidden = true;
        closeBtn.hidden = true;
      }
      closeTimer = null;
    }, TRANSITION_MS);

    openBtn?.focus({ preventScroll: true });
  }

  openBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen()) {
      closeDrawer();
    }
  });

  logoutLink?.addEventListener("click", function () {
    clearSession();
  });

  addProductBtn?.addEventListener("click", function () {
    window.location.href = "mes-plats.html";
  });

  addCategoryBtn?.addEventListener("click", function () {
    window.location.href = "categories.html";
  });

  viewMenuBtn?.addEventListener("click", function () {
    const explicitUrl = viewMenuBtn.getAttribute("data-menu-url");
    if (explicitUrl) {
      window.location.href = explicitUrl;
    }
  });

  copyMenuBtn?.addEventListener("click", copyMenuUrl);

  loadDashboard();
})();
