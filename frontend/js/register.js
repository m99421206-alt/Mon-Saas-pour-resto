/**
 * Inscription — contrôle basique (mots de passe identiques).
 * L’envoi au backend sera branché à l’étape API.
 */
(function () {
  "use strict";

  const form = document.getElementById("form-register");
  const err = document.getElementById("register-error");
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

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearError();

    if (pwd.value !== pwd2.value) {
      showError("Les mots de passe ne correspondent pas.");
      pwd2.focus();
      return;
    }

    // Mode prototype frontend: après validation locale, on ouvre le dashboard.
    // Plus tard: remplacer cette redirection par un appel API d'inscription.
    clearError();
    window.location.href = "dashboard.html";
  });
})();
