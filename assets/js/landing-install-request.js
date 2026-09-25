/**
 * Page d'accueil — formulaire modal « Demander une installation ».
 */
(function () {
  "use strict";

  function getApiBase() {
    var cfg = window.MenuGo_CONFIG || {};
    if (cfg.API_URL) {
      return String(cfg.API_URL).replace(/\/$/, "");
    }
    var hostname = window.location.hostname || "127.0.0.1";
    var protocol = window.location.protocol === "https:" ? "https:" : "http:";
    var isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.indexOf("192.168.") === 0;
    if (isLocal) {
      return protocol + "//" + hostname + ":4000/api";
    }
    return window.location.origin.replace(/\/$/, "") + "/api";
  }

  var lastInstallModalTrigger = null;
  var MALI_COUNTRY_CODE = "223";

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  /**
   * Numéro local (sans +223) → format backend (+223XXXXXXXX).
   * Accepte les espaces ; ne modifie pas les numéros déjà complets.
   */
  function normalizeMaliWhatsappInput(raw) {
    var digits = digitsOnly(raw);
    if (!digits.length) {
      return null;
    }

    if (digits.indexOf(MALI_COUNTRY_CODE) === 0 && digits.length >= 11) {
      return "+" + digits.slice(0, 13);
    }

    if (digits.charAt(0) === "0") {
      digits = digits.replace(/^0+/, "");
    }

    if (digits.length === 8) {
      return "+" + MALI_COUNTRY_CODE + digits;
    }

    if (digits.length > 8 && digits.indexOf(MALI_COUNTRY_CODE) === 0) {
      return "+" + digits.slice(0, 13);
    }

    return false;
  }

  function collectFormPayload() {
    return {
      restaurantName: String(
        (document.getElementById("install-restaurant-name") || {}).value || "",
      ).trim(),
      fullName: String(
        (document.getElementById("install-full-name") || {}).value || "",
      ).trim(),
      whatsappLocal: String(
        (document.getElementById("install-whatsapp") || {}).value || "",
      ).trim(),
      city: String((document.getElementById("install-city") || {}).value || "").trim(),
    };
  }

  function validateFormPayload(raw) {
    if (!raw.restaurantName) {
      return "Indiquez le nom de votre restaurant.";
    }

    var normalizedWhatsapp = normalizeMaliWhatsappInput(raw.whatsappLocal);
    if (normalizedWhatsapp === null) {
      return "Indiquez votre numéro WhatsApp.";
    }
    if (normalizedWhatsapp === false) {
      return "Numéro WhatsApp invalide. Exemple : 99 42 12 06";
    }

    if (!raw.city) {
      return "Sélectionnez votre ville.";
    }

    return null;
  }

  function releaseModalFocus(modal) {
    var active = document.activeElement;
    if (!active || !modal.contains(active)) {
      return;
    }
    if (
      lastInstallModalTrigger &&
      typeof lastInstallModalTrigger.focus === "function"
    ) {
      lastInstallModalTrigger.focus();
      return;
    }
    active.blur();
  }

  function setModalOpen(open) {
    var modal = document.getElementById("install-request-modal");
    if (!modal) {
      return;
    }
    if (open) {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("install-modal-open");
      var firstInput = modal.querySelector("#install-restaurant-name");
      if (firstInput) {
        window.setTimeout(function () {
          firstInput.focus();
        }, 60);
      }
      return;
    }
    releaseModalFocus(modal);
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("install-modal-open");
  }

  function resetForm() {
    var form = document.getElementById("install-request-form");
    var success = document.getElementById("install-request-success");
    var errorEl = document.getElementById("install-request-error");
    if (form) {
      form.reset();
      form.hidden = false;
    }
    if (success) {
      success.hidden = true;
    }
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
  }

  function closeMobileNav() {
    document.body.classList.remove("site-header--nav-open");
    var nav = document.getElementById("primary-nav");
    var btn = document.getElementById("site-header-menu-btn");
    if (nav) {
      nav.classList.remove("is-open");
    }
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Ouvrir le menu");
    }
  }

  function resolveInstallTrigger(evOrTrigger) {
    if (!evOrTrigger) {
      return null;
    }
    if (typeof evOrTrigger.closest === "function") {
      return evOrTrigger.closest("[data-open-install-modal]") || evOrTrigger;
    }
    if (evOrTrigger.target && typeof evOrTrigger.target.closest === "function") {
      return evOrTrigger.target.closest("[data-open-install-modal]");
    }
    return null;
  }

  function openInstallModal(evOrTrigger) {
    if (evOrTrigger && typeof evOrTrigger.preventDefault === "function") {
      evOrTrigger.preventDefault();
    }
    var trigger = resolveInstallTrigger(evOrTrigger);
    if (trigger) {
      lastInstallModalTrigger = trigger;
    }
    closeMobileNav();
    resetForm();
    setModalOpen(true);
  }

  function bindTriggers() {
    document.addEventListener("click", function (ev) {
      var trigger = ev.target.closest("[data-open-install-modal]");
      if (!trigger) {
        return;
      }
      openInstallModal(ev);
    });
  }

  function bindModalClose() {
    var modal = document.getElementById("install-request-modal");
    if (!modal) {
      return;
    }
    modal.querySelectorAll("[data-close-install-modal]").forEach(function (el) {
      el.addEventListener("click", function () {
        setModalOpen(false);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("is-open")) {
        setModalOpen(false);
      }
    });
  }

  function showError(message) {
    var errorEl = document.getElementById("install-request-error");
    if (!errorEl) {
      return;
    }
    errorEl.textContent = message || "Une erreur est survenue.";
    errorEl.hidden = false;
  }

  function showSuccess() {
    var form = document.getElementById("install-request-form");
    var success = document.getElementById("install-request-success");
    if (form) {
      form.hidden = true;
    }
    if (success) {
      success.hidden = false;
    }
  }

  async function submitForm(ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var submitBtn = document.getElementById("install-request-submit");
    var errorEl = document.getElementById("install-request-error");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    var raw = collectFormPayload();
    var validationError = validateFormPayload(raw);
    if (validationError) {
      showError(validationError);
      return;
    }

    var normalizedWhatsapp = normalizeMaliWhatsappInput(raw.whatsappLocal);
    var payload = {
      restaurantName: raw.restaurantName,
      fullName: raw.fullName,
      whatsapp: normalizedWhatsapp,
      city: raw.city,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      var url = getApiBase() + "/auth/installation-request";
      var response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      var data = null;
      try {
        data = await response.json();
      } catch (e) {
        data = null;
      }

      if (!response.ok) {
        var msg =
          data && data.message ?
            data.message
          : data && data.errors && data.errors[0] && data.errors[0].message ?
            data.errors[0].message
          : "Impossible d'envoyer la demande. Réessayez.";
        showError(msg);
        return;
      }

      showSuccess();
    } catch (err) {
      showError("Connexion impossible. Vérifiez votre réseau.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  }

  function bindForm() {
    var form = document.getElementById("install-request-form");
    if (form) {
      form.addEventListener("submit", submitForm);
    }
  }

  function initInstallModal() {
    bindTriggers();
    bindModalClose();
    bindForm();
    window.AFRICA_openInstallModal = openInstallModal;
    window.__AFRICA_INSTALL_MODAL_READY = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initInstallModal);
  } else {
    initInstallModal();
  }
})();
