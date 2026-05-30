/**
 * MenuGo — Shell desktop / tablette pour pages restaurant
 * - Sidebar fixe sur grand écran
 * - Header desktop (profil, notifications, paramètres)
 * - Mise à jour profil depuis session
 */
(function () {
  "use strict";

  var DESKTOP_MQ = window.matchMedia("(min-width: 64rem)");

  function isDesktopShell() {
    return DESKTOP_MQ.matches;
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem("MenuGo_user") || "null");
    } catch (error) {
      return null;
    }
  }

  function getStoredRestaurant() {
    try {
      return JSON.parse(localStorage.getItem("MenuGo_restaurant") || "null");
    } catch (error) {
      return null;
    }
  }

  function getPageEyebrow() {
    var active = document.querySelector(".dash-drawer__link.is-active .dash-drawer__label");
    if (active && active.textContent) {
      return active.textContent.trim();
    }
    return "MenuGo";
  }

  function initialsFromName(name) {
    var parts = String(name || "M")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "M";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function ensureDashLayout() {
    if (document.querySelector(".dash-layout")) return;

    var main = document.querySelector(".dashboard-main");
    if (!main || !main.parentNode) return;

    var layout = document.createElement("div");
    layout.className = "dash-layout";

    var header = document.createElement("header");
    header.className = "dash-desktop-header";
    header.setAttribute("aria-label", "En-tête de l'application");
    header.innerHTML =
      '<div class="dash-desktop-header__inner">' +
      '<div class="dash-desktop-header__left">' +
      '<p class="dash-desktop-header__eyebrow"></p>' +
      '<h2 class="dash-desktop-header__title" id="dash-desktop-restaurant">Mon restaurant</h2>' +
      "</div>" +
      '<div class="dash-desktop-header__actions">' +
      '<button type="button" class="dash-desktop-header__icon-btn" id="dash-notifications-btn" aria-label="Notifications">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
      "</svg>" +
      '<span class="dash-desktop-header__dot" aria-hidden="true"></span>' +
      "</button>" +
      '<a href="parametres.html" class="dash-desktop-header__icon-btn" aria-label="Paramètres">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75"/>' +
      '<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      "</a>" +
      '<div class="dash-desktop-header__profile">' +
      '<span class="dash-desktop-header__avatar" id="dash-desktop-avatar" aria-hidden="true">M</span>' +
      '<div class="dash-desktop-header__profile-meta">' +
      '<span class="dash-desktop-header__profile-name" id="dash-desktop-name">Mon restaurant</span>' +
      '<span class="dash-desktop-header__profile-email" id="dash-desktop-email">email</span>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    var eyebrow = header.querySelector(".dash-desktop-header__eyebrow");
    if (eyebrow) eyebrow.textContent = getPageEyebrow();

    main.parentNode.insertBefore(layout, main);
    layout.appendChild(header);
    layout.appendChild(main);
  }

  function updateDrawerFooters(restaurantName, email) {
    document.querySelectorAll(".dash-drawer__resto").forEach(function (el) {
      el.textContent = restaurantName;
    });
    document.querySelectorAll(".dash-drawer__email").forEach(function (el) {
      el.textContent = email || "email du resto";
    });
  }

  function populateDashShellProfile(user, restaurant) {
    var rest = restaurant || getStoredRestaurant();
    var usr = user || getStoredUser();
    var restName = rest && rest.name ? String(rest.name).trim() : "Mon restaurant";
    var email = usr && usr.email ? String(usr.email).trim() : "email du resto";

    updateDrawerFooters(restName, email);

    var desktopTitle = document.getElementById("dash-desktop-restaurant");
    var desktopName = document.getElementById("dash-desktop-name");
    var desktopEmail = document.getElementById("dash-desktop-email");
    var desktopAvatar = document.getElementById("dash-desktop-avatar");

    if (desktopTitle) desktopTitle.textContent = restName;
    if (desktopName) desktopName.textContent = restName;
    if (desktopEmail) desktopEmail.textContent = email;
    if (desktopAvatar) desktopAvatar.textContent = initialsFromName(restName);
  }

  function syncDesktopDrawerState() {
    var drawer = document.getElementById("dash-drawer");
    var overlay = document.getElementById("dash-overlay");
    var closeBtn = document.getElementById("close-drawer");
    var openBtn = document.getElementById("open-drawer");

    if (!drawer) return;

    if (isDesktopShell()) {
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      if (overlay) {
        overlay.hidden = true;
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
      }
      if (closeBtn) {
        closeBtn.hidden = true;
        closeBtn.classList.remove("is-visible");
      }
      if (openBtn) openBtn.setAttribute("aria-expanded", "false");
      document.body.classList.add("dash-shell-desktop");
      document.body.style.overflow = "";
      return;
    }

    document.body.classList.remove("dash-shell-desktop");
    if (!drawer.classList.contains("is-open")) {
      drawer.setAttribute("aria-hidden", "true");
    }
  }

  function initAdminImpersonationBanner() {
    var adminToken = null;
    try {
      adminToken = sessionStorage.getItem("MenuGo_admin_token");
    } catch (error) {
      return;
    }
    if (!adminToken) return;

    var main = document.querySelector(".dashboard-main");
    if (!main || document.getElementById("dash-admin-impersonation-banner")) return;

    var rest = getStoredRestaurant();
    var restName = rest && rest.name ? String(rest.name) : "ce restaurant";

    var banner = document.createElement("section");
    banner.id = "dash-admin-impersonation-banner";
    banner.className = "dash-admin-impersonation-banner";
    banner.setAttribute("role", "status");

    var inner = document.createElement("div");
    inner.className = "dash-admin-impersonation-banner__inner";

    var text = document.createElement("p");
    text.className = "dash-admin-impersonation-banner__text";
    text.innerHTML =
      "<strong>Mode installation admin</strong> — Vous gérez le tableau de bord de <em></em>.";

    var em = text.querySelector("em");
    if (em) em.textContent = restName;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dash-admin-impersonation-banner__btn";
    btn.id = "dash-admin-return-btn";
    btn.textContent = "Retour à l’admin";
    btn.addEventListener("click", function () {
      var backupToken = null;
      var backupUser = null;
      var returnUrl = "admin-restaurants.html";
      try {
        backupToken = sessionStorage.getItem("MenuGo_admin_token");
        backupUser = sessionStorage.getItem("MenuGo_admin_user");
        returnUrl = sessionStorage.getItem("MenuGo_admin_return") || returnUrl;
        sessionStorage.removeItem("MenuGo_admin_token");
        sessionStorage.removeItem("MenuGo_admin_user");
        sessionStorage.removeItem("MenuGo_admin_return");
      } catch (error) {}

      if (backupToken) {
        localStorage.setItem("MenuGo_token", backupToken);
        if (backupUser) {
          localStorage.setItem("MenuGo_user", backupUser);
        } else {
          localStorage.removeItem("MenuGo_user");
        }
        localStorage.removeItem("MenuGo_restaurant");
      }

      window.location.href = returnUrl;
    });

    inner.appendChild(text);
    inner.appendChild(btn);
    banner.appendChild(inner);
    main.insertBefore(banner, main.firstChild);
  }

  function initNotificationsPlaceholder() {
    var btn = document.getElementById("dash-notifications-btn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      btn.classList.toggle("is-active");
    });
  }

  function initFromStorage() {
    populateDashShellProfile(getStoredUser(), getStoredRestaurant());
  }

  ensureDashLayout();
  syncDesktopDrawerState();
  initFromStorage();
  initAdminImpersonationBanner();
  initNotificationsPlaceholder();

  if (window.MenuGo_SubscriptionAlerts && window.MenuGo_SubscriptionAlerts.fetchAndMountClientBanner) {
    window.MenuGo_SubscriptionAlerts.fetchAndMountClientBanner();
  }

  DESKTOP_MQ.addEventListener("change", syncDesktopDrawerState);

  window.MenuGo_DashShell = {
    ensureDashLayout: ensureDashLayout,
    populateProfile: populateDashShellProfile,
    syncDesktopDrawerState: syncDesktopDrawerState,
    isDesktop: isDesktopShell,
  };
})();
