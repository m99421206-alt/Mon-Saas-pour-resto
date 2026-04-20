/**
 * Dashboard AfricaMenu
 * - Drawer : ouverture / fermeture, overlay, Escape, aria-expanded
 * - Le reste du contenu (stats, actions, lien, QR) est statique pour l’instant ;
 *   brancher les boutons sur l’API quand le backend sera prêt.
 */
(function () {
  "use strict";

  const openBtn = document.getElementById("open-drawer");
  const closeBtn = document.getElementById("close-drawer");
  const drawer = document.getElementById("dash-drawer");
  const overlay = document.getElementById("dash-overlay");

  const TRANSITION_MS = 320;
  let closeTimer = null;

  function isOpen() {
    return drawer.classList.contains("is-open");
  }

  function openDrawer() {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    closeBtn.hidden = false;

    window.requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
      closeBtn.classList.add("is-visible");
    });

    openBtn?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";

    closeBtn?.focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (!isOpen()) return;

    overlay.classList.remove("is-visible");
    closeBtn.classList.remove("is-visible");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");

    openBtn?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";

    closeTimer = window.setTimeout(function () {
      if (!drawer.classList.contains("is-open")) {
        overlay.hidden = true;
        closeBtn.hidden = true;
      }
      closeTimer = null;
    }, TRANSITION_MS);

    openBtn?.focus({ preventScroll: true });
  }

  openBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen()) {
      closeDrawer();
    }
  });
})();
