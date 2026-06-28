/**
 * AfricaMenu — Alertes d’expiration d’abonnement (restaurant) + liens WhatsApp préremplis.
 * Aucun envoi automatique : ouverture manuelle via wa.me uniquement.
 */
(function () {
  "use strict";

  var BANNER_ID = "dash-sub-expiry-banner";
  var DEFAULT_SUPPORT_WHATSAPP = "22399421206";
  /** Alerte affichée uniquement les N derniers jours avant échéance. */
  var ALERT_DAYS_BEFORE = 3;

  function waDigits(raw) {
    return String(raw || "")
      .replace(/\D/g, "")
      .replace(/^0+/, "");
  }

  function getSupportWhatsAppDigits() {
    var cfg = window.MenuGo_CONFIG || {};
    return waDigits(cfg.SUPPORT_WHATSAPP) || DEFAULT_SUPPORT_WHATSAPP;
  }

  /** @param {string|null|undefined} iso */
  function formatDateFr(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  /** @param {object|null|undefined} sub */
  function resolveDaysRemaining(sub) {
    if (!sub) return null;
    if (sub.days_remaining !== undefined && sub.days_remaining !== null) {
      var n = Number(sub.days_remaining);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
    }
    if (!sub.ends_at) return null;
    var end = new Date(sub.ends_at);
    if (!Number.isFinite(end.getTime())) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    var diff = Math.round((end.getTime() - today.getTime()) / 86400000);
    return diff < 0 ? 0 : diff;
  }

  /** @param {object|null|undefined} sub */
  function isSubscriptionExpired(sub) {
    if (!sub) return false;
    var st = String(sub.status || "").toLowerCase();
    if (st === "expired") return true;
    if (!sub.ends_at) return false;
    var dr = resolveDaysRemaining(sub);
    return dr !== null && dr <= 0;
  }

  /**
   * Tier bannière client : warning-orange | expired | null
   * @param {object|null|undefined} sub
   */
  function getClientAlertTier(sub) {
    if (!sub || !sub.ends_at) return null;
    if (String(sub.status || "").toLowerCase() === "suspended") return null;
    if (isSubscriptionExpired(sub)) return "expired";
    var dr = resolveDaysRemaining(sub);
    if (dr === null) return null;
    if (dr >= 1 && dr <= ALERT_DAYS_BEFORE) return "warning-orange";
    return null;
  }

  /**
   * @param {string} restaurantName
   * @param {string|null|undefined} endsAtIso
   */
  function buildRenewalWhatsAppMessage(restaurantName, endsAtIso) {
    var rn = restaurantName ? String(restaurantName).trim() : "Mon restaurant";
    var exp = formatDateFr(endsAtIso);
    return (
      "Bonjour AfricaMenu,\n\n" +
      "Je suis le restaurant " +
      rn +
      ".\n\n" +
      "Mon abonnement expire le " +
      exp +
      ".\n\n" +
      "Je souhaite obtenir des informations pour le renouvellement.\n\n" +
      "Merci."
    );
  }

  /**
   * @param {string} restaurantName
   * @param {string|null|undefined} endsAtIso
   */
  function buildWhatsAppUrl(restaurantName, endsAtIso) {
    var digits = getSupportWhatsAppDigits();
    if (!digits) return "#";
    return (
      "https://wa.me/" +
      digits +
      "?text=" +
      encodeURIComponent(buildRenewalWhatsAppMessage(restaurantName, endsAtIso))
    );
  }

  function removeExistingBanner() {
    var existing = document.getElementById(BANNER_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function findBannerInsertPoint(main) {
    var hero = main.querySelector(".dash-hero");
    if (hero && hero.parentNode === main) {
      return hero.nextSibling;
    }
    var topbar = main.querySelector(".dash-topbar");
    if (topbar && topbar.parentNode === main) {
      return topbar.nextSibling;
    }
    var adminBanner = document.getElementById("dash-admin-impersonation-banner");
    if (adminBanner && adminBanner.parentNode === main) {
      return adminBanner.nextSibling;
    }
    return main.firstChild;
  }

  function createBannerButton(text, href, className, external) {
    var el = document.createElement("a");
    el.className = className;
    el.textContent = text;
    el.href = href || "#";
    if (external) {
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }
    return el;
  }

  /**
   * @param {object} me — réponse GET /api/me
   */
  function mountClientBanner(me) {
    removeExistingBanner();

    var sub = me && me.subscription ? me.subscription : null;
    var tier = getClientAlertTier(sub);
    if (!tier) return;

    var main = document.querySelector(".dashboard-main");
    if (!main) return;

    var restaurant = (me && me.restaurant) || null;
    var restName =
      restaurant && restaurant.name ? String(restaurant.name).trim() : "Mon restaurant";
    var dr = resolveDaysRemaining(sub);
    var waUrl = buildWhatsAppUrl(restName, sub.ends_at);

    var section = document.createElement("section");
    section.id = BANNER_ID;
    section.className = "dash-sub-expiry-banner dash-sub-expiry-banner--" + tier;
    section.setAttribute("role", "alert");

    var inner = document.createElement("div");
    inner.className = "dash-sub-expiry-banner__inner";

    var text = document.createElement("p");
    text.className = "dash-sub-expiry-banner__text";

    if (tier === "warning-orange") {
      var daysLabel =
        dr === 1 ?
          "Votre abonnement expire demain."
        : "Votre abonnement expire dans " + String(dr != null ? dr : "—") + " jours.";
      text.textContent = daysLabel;
    } else {
      text.textContent =
        "Votre abonnement a expiré. Certaines fonctionnalités sont limitées.";
    }

    inner.appendChild(text);

    var actions = document.createElement("div");
    actions.className = "dash-sub-expiry-banner__actions";

    if (tier === "warning-orange") {
      actions.appendChild(
        createBannerButton(
          "Contacter AfricaMenu",
          waUrl,
          "dash-sub-expiry-banner__btn dash-sub-expiry-banner__btn--whatsapp",
          true,
        ),
      );
      actions.appendChild(
        createBannerButton(
          "Voir mon abonnement",
          "mon-abonnement.html",
          "dash-sub-expiry-banner__btn dash-sub-expiry-banner__btn--secondary",
          false,
        ),
      );
    } else {
      actions.appendChild(
        createBannerButton(
          "Contacter AfricaMenu",
          waUrl,
          "dash-sub-expiry-banner__btn dash-sub-expiry-banner__btn--whatsapp",
          true,
        ),
      );
      actions.appendChild(
        createBannerButton(
          "Voir mon abonnement",
          "mon-abonnement.html",
          "dash-sub-expiry-banner__btn dash-sub-expiry-banner__btn--secondary",
          false,
        ),
      );
    }

    inner.appendChild(actions);
    section.appendChild(inner);

    var insertBefore = findBannerInsertPoint(main);
    if (insertBefore) {
      main.insertBefore(section, insertBefore);
    } else {
      main.appendChild(section);
    }
  }

  function fetchAndMountClientBanner() {
    var token = null;
    try {
      token = localStorage.getItem("MenuGo_token");
    } catch (error) {
      return;
    }
    if (!token) return;

    var cfg = window.MenuGo_CONFIG || {};
    var apiUrl = String(cfg.API_URL || "").replace(/\/$/, "");
    if (!apiUrl) return;

    fetch(apiUrl + "/api/me", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            return { ok: response.ok, data: data };
          });
      })
      .then(function (res) {
        if (!res.ok || !res.data) return;
        mountClientBanner(res.data);
      })
      .catch(function () {});
  }

  window.MenuGo_SubscriptionAlerts = {
    BANNER_ID: BANNER_ID,
    ALERT_DAYS_BEFORE: ALERT_DAYS_BEFORE,
    resolveDaysRemaining: resolveDaysRemaining,
    isSubscriptionExpired: isSubscriptionExpired,
    getClientAlertTier: getClientAlertTier,
    formatDateFr: formatDateFr,
    buildRenewalWhatsAppMessage: buildRenewalWhatsAppMessage,
    buildWhatsAppUrl: buildWhatsAppUrl,
    mountClientBanner: mountClientBanner,
    fetchAndMountClientBanner: fetchAndMountClientBanner,
  };
})();
