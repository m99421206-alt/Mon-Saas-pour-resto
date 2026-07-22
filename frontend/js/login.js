/**
 * Connexion — appel API puis stockage du JWT.
 */
(function () {
  "use strict";

  const API_URL = window.MenuGo_CONFIG.API_URL;
  const TOKEN_KEY = "MenuGo_token";
  const USER_KEY = "MenuGo_user";
  const RESTAURANT_KEY = "MenuGo_restaurant";

  const form = document.getElementById("form-login");
  const err = document.getElementById("login-error");
  const submitBtn = form.querySelector('button[type="submit"]');

  function showError(msg) {
    err.textContent = msg;
    err.classList.add("is-visible");
  }

  function clearError() {
    err.textContent = "";
    err.classList.remove("is-visible");
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  function saveSession(data) {
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
      localStorage.setItem(
        RESTAURANT_KEY,
        JSON.stringify(data.restaurant || null),
      );
    } catch (e) {
      console.warn("Storage inacessible", e);
    }
  }

  function wantsOnboarding(data) {
    if (!data || data.is_platform_admin) {
      return false;
    }
    var r = data.restaurant;
    if (!r) {
      return false;
    }
    return r.onboarding_seen === false;
  }

  // ... (Garde la partie Modal Réinitialisation de Mot de Passe ici) ...

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearError();

    //  FIX 1 : Force la minuscules et nettoie les espaces
    const emailInput = document.getElementById("login-email");
    const email = emailInput.value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
      showError("Renseignez votre email et votre mot de passe.");
      return;
    }

    if (
      window.MenuGo_EmailValidate &&
      !window.MenuGo_EmailValidate.isValidEmail(email)
    ) {
      showError(window.MenuGo_EmailValidate.emailFormatMessage());
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Connexion...";

    try {
      const response = await fetch(API_URL + "/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        showError(data.message || "Connexion impossible. Réessayez.");
        return;
      }

      saveSession(data);

      var params = new URLSearchParams(window.location.search);
      var next = params.get("next");

      function isSafeNextPage(url) {
        if (!url || typeof url !== "string") return false;
        if (
          url.indexOf("/") !== -1 ||
          url.indexOf("\\") !== -1 ||
          url.indexOf("..") !== -1
        )
          return false;
        if (/^https?:/i.test(url) || url.indexOf("//") === 0) return false;
        return /^[a-zA-Z0-9_-]+\.html$/.test(url);
      }

      function isAdminNextPage(url) {
        return typeof url === "string" && /^admin-[\w.-]+\.html$/i.test(url);
      }

      if (
        wantsOnboarding(data) &&
        !(isSafeNextPage(next) && isAdminNextPage(next))
      ) {
        window.location.href = "onboarding.html";
      } else if (isSafeNextPage(next)) {
        window.location.href = next;
      } else if (data.is_platform_admin) {
        window.location.href = "admin-dashboard.html";
      } else {
        window.location.href = "dashboard.html";
      }
    } catch (error) {
      // Affiche le détail en alerte pour déboguer si le réseau mobile plante
      alert("Erreur connexion: " + error.message);
      showError(
        "Impossible de contacter le serveur. Vérifiez votre connexion internet.",
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Se connecter";
    }
  });
})();
