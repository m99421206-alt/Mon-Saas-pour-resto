/**
 * Page Paramètres — soumission locale (démo) en attendant l’API.
 */
(function () {
  "use strict";

  var form = document.getElementById("parametres-form");
  var feedback = document.getElementById("parametres-feedback");

  if (!form) return;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (feedback) {
      feedback.textContent = "Modifications enregistrées (démo — brancher l’API pour la persistance).";
      feedback.hidden = false;
    }
  });
})();
