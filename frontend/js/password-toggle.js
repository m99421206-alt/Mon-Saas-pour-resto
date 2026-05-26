/**
 * Bouton afficher/masquer le mot de passe — pages auth utilisant
 * .auth-password-toggle[data-password-target="<id input>"]
 */
(function () {
  "use strict";

  var LABEL_SHOW = "Afficher le mot de passe";
  var LABEL_HIDE = "Masquer le mot de passe";

  function syncButton(btn, revealed) {
    btn.classList.toggle("is-revealed", revealed);
    btn.setAttribute("aria-pressed", revealed ? "true" : "false");
    btn.setAttribute("aria-label", revealed ? LABEL_HIDE : LABEL_SHOW);
  }

  function bindToggle(btn) {
    var id = btn.getAttribute("data-password-target");
    if (!id) return;
    var input = document.getElementById(id);
    if (!input || input.tagName !== "INPUT") return;

    btn.addEventListener("click", function () {
      var reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      syncButton(btn, reveal);
    });
  }

  function init() {
    document.querySelectorAll(".auth-password-toggle[data-password-target]").forEach(bindToggle);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
