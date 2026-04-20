/**
 * Page Catégories — actions locales (formulaire / API à brancher plus tard).
 */
(function () {
  "use strict";

  function onAddCategory() {
    /* TODO: ouvrir modal ou formulaire d’ajout de catégorie */
  }

  document.querySelectorAll("[data-action='add-category']").forEach(function (el) {
    el.addEventListener("click", onAddCategory);
  });
})();
