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

  function openInstallModal(ev) {
    if (ev) {
      ev.preventDefault();
      lastInstallModalTrigger = ev.target.closest("[data-open-install-modal]");
    }
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

    var payload = {
      restaurantName: String(
        (document.getElementById("install-restaurant-name") || {}).value || "",
      ).trim(),
      fullName: String(
        (document.getElementById("install-full-name") || {}).value || "",
      ).trim(),
      whatsapp: String(
        (document.getElementById("install-whatsapp") || {}).value || "",
      ).trim(),
      city: String((document.getElementById("install-city") || {}).value || "").trim(),
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

  document.addEventListener("DOMContentLoaded", function () {
    bindTriggers();
    bindModalClose();
    bindForm();
  });
})();
