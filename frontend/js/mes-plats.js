/**
 * Page Mes plats — actions locales (formulaire / API à brancher plus tard).
 */
(function () {
  "use strict";

  function onAddPlat() {
    /* TODO: ouvrir modal ou naviguer vers formulaire d’ajout */
  }

  document.querySelectorAll("[data-action='add-plat']").forEach(function (el) {
    el.addEventListener("click", onAddPlat);
  });
})();
