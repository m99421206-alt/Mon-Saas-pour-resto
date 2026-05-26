/**
 * Inscription — appel API puis stockage du JWT.
 */
(function () {
  "use strict";

  const API_URL = window.AFRICAMENU_CONFIG.API_URL;
  const TOKEN_KEY = "africamenu_token";
  const USER_KEY = "africamenu_user";
  const RESTAURANT_KEY = "africamenu_restaurant";

  const form = document.getElementById("form-register");
  const err = document.getElementById("register-error");
  const submitBtn = form.querySelector('button[type="submit"]');
  const restaurantName = document.getElementById("restaurant-name");
  const email = document.getElementById("email");
  const whatsapp = document.getElementById("whatsapp");
  const pwd = document.getElementById("password");
  const pwd2 = document.getElementById("password-confirm");

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
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
    localStorage.setItem(RESTAURANT_KEY, JSON.stringify(data.restaurant || null));
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearError();

    if (!restaurantName.value.trim() || !email.value.trim() || !pwd.value) {
      showError("Renseignez le nom du restaurant, l'email et le mot de passe.");
      return;
    }

    if (!whatsapp.value.trim()) {
      showError("Le numéro WhatsApp pour les commandes est obligatoire.");
      whatsapp.focus();
      return;
    }

    if (pwd.value.length < 8) {
      showError("Le mot de passe doit contenir au moins 8 caractères.");
      pwd.focus();
      return;
    }

    if (pwd.value !== pwd2.value) {
      showError("Les mots de passe ne correspondent pas.");
      pwd2.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Création...";

    try {
      const response = await fetch(API_URL + "/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantName: restaurantName.value.trim(),
          email: email.value.trim(),
          password: pwd.value,
          whatsapp: whatsapp.value.trim(),
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        showError(data.message || "Inscription impossible. Réessayez.");
        return;
      }

      saveSession(data);
      if (
        data.is_platform_admin ||
        !data.restaurant ||
        data.restaurant.onboarding_seen !== false
      ) {
        window.location.href = "dashboard.html";
      } else {
        window.location.href = "onboarding.html";
      }
    } catch (error) {
      showError("Impossible de contacter le serveur. Vérifiez que l'API est lancée.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Créer mon compte";
    }
  });
})();
