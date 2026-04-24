/**
 * Interactions "Mon Menu"
 * - Tout élément ayant data-action="view-public-menu" redirige vers /menu/:id
 * - L'URL explicite vient de data-menu-url si elle existe
 * - Sinon l'id vient de data-menu-id de l'élément, puis du body, puis ?id=, puis "demo"
 */
(function () {
  "use strict";

  var triggers = document.querySelectorAll('[data-action="view-public-menu"]');
  if (!triggers.length) return;

  function resolveMenuId(trigger) {
    var fromTrigger = trigger && trigger.getAttribute("data-menu-id");
    if (fromTrigger && String(fromTrigger).trim()) {
      return String(fromTrigger).trim();
    }

    var fromBody = document.body && document.body.getAttribute("data-menu-id");
    if (fromBody && String(fromBody).trim()) {
      return String(fromBody).trim();
    }

    var fromQuery = new URLSearchParams(window.location.search).get("id");
    if (fromQuery && String(fromQuery).trim()) {
      return String(fromQuery).trim();
    }

    return "demo";
  }

  function onViewMenu(event) {
    event.preventDefault();
    var explicitUrl = event.currentTarget && event.currentTarget.getAttribute("data-menu-url");
    if (explicitUrl && String(explicitUrl).trim()) {
      window.location.assign(String(explicitUrl).trim());
      return;
    }

    var id = resolveMenuId(event.currentTarget);
    window.location.assign("/menu/" + encodeURIComponent(id));
  }

  triggers.forEach(function (trigger) {
    trigger.addEventListener("click", onViewMenu);
  });
})();
