/**
 * MenuGo — Notifications toast pour le dashboard client.
 */
(function () {
  "use strict";

  var ROOT_ID = "dash-toast-root";
  var MAX_VISIBLE = 4;
  var DEFAULT_DURATION = 4200;

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "dash-toast-root";
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-relevant", "additions");
    document.body.appendChild(root);
    return root;
  }

  function getIcon(type) {
    if (type === "error") {
      return (
        '<svg class="dash-toast__icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.75"/>' +
        '<path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
        "</svg>"
      );
    }
    if (type === "info") {
      return (
        '<svg class="dash-toast__icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.75"/>' +
        '<path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
        "</svg>"
      );
    }
    return (
      '<svg class="dash-toast__icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.75"/>' +
      '<path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function removeToast(node) {
    if (!node || !node.parentNode) return;
    node.classList.add("is-leaving");
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 220);
  }

  function show(message, type, duration) {
    var text = String(message || "").trim();
    if (!text) return null;

    var toastType = type === "error" || type === "info" ? type : "success";
    var ms = typeof duration === "number" && duration > 0 ? duration : DEFAULT_DURATION;
    var root = ensureRoot();

    while (root.children.length >= MAX_VISIBLE) {
      removeToast(root.firstElementChild);
    }

    var toast = document.createElement("div");
    toast.className = "dash-toast dash-toast--" + toastType;
    toast.setAttribute("role", toastType === "error" ? "alert" : "status");
    toast.innerHTML =
      '<span class="dash-toast__icon">' +
      getIcon(toastType) +
      "</span>" +
      '<p class="dash-toast__text"></p>' +
      '<button type="button" class="dash-toast__close" aria-label="Fermer la notification">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
      "</svg>" +
      "</button>";

    var textEl = toast.querySelector(".dash-toast__text");
    if (textEl) textEl.textContent = text;

    var closeBtn = toast.querySelector(".dash-toast__close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        window.clearTimeout(toast._timer);
        removeToast(toast);
      });
    }

    root.appendChild(toast);
    window.requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });

    toast._timer = window.setTimeout(function () {
      removeToast(toast);
    }, ms);

    return toast;
  }

  window.MenuGo_Toast = {
    show: show,
    success: function (message, duration) {
      return show(message, "success", duration);
    },
    error: function (message, duration) {
      return show(message, "error", duration);
    },
    info: function (message, duration) {
      return show(message, "info", duration);
    },
  };
})();
