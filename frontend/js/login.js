/**
 * Connexion — appel API puis stockage du JWT.
 */
(function () {
  "use strict";

  const API_URL = "http://localhost:4000";
  const TOKEN_KEY = "africamenu_token";
  const USER_KEY = "africamenu_user";
  const RESTAURANT_KEY = "africamenu_restaurant";

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
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
    localStorage.setItem(RESTAURANT_KEY, JSON.stringify(data.restaurant || null));
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearError();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
      showError("Renseignez votre email et votre mot de passe.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Connexion...";

    try {
      const response = await fetch(API_URL + "/login", {
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
      window.location.href = "dashboard.html";
    } catch (error) {
      showError("Impossible de contacter le serveur. Vérifiez que l'API est lancée.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Se connecter";
    }
  });
})();
