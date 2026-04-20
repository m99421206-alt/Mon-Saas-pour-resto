/**
 * Connexion — placeholder jusqu’à l’API (POST /api/login ou session).
 */
(function () {
  "use strict";

  const form = document.getElementById("form-login");
  const err = document.getElementById("login-error");

  function showError(msg) {
    err.textContent = msg;
    err.classList.add("is-visible");
  }

  function clearError() {
    err.textContent = "";
    err.classList.remove("is-visible");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearError();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
      showError("Renseignez votre email et votre mot de passe.");
      return;
    }

    clearError();
    // Mode prototype frontend: on envoie l'utilisateur vers le dashboard.
    window.location.href = "dashboard.html";
  });
})();
