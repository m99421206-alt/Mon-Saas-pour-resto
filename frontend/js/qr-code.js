/**
 * Page « Votre QR Code »
 * - Aperçu : motif type QR dessiné sur <canvas> (placeholder jusqu’à génération serveur)
 * - Téléchargement PNG du canvas
 * - Copie du lien partageable dans le presse-papiers
 */
(function () {
  "use strict";

  var canvas = document.getElementById("qr-code-canvas");
  var downloadBtn = document.getElementById("qr-code-download");
  var copyBtn = document.getElementById("qr-copy-btn");
  var urlInput = document.getElementById("qr-share-url");
  var feedback = document.getElementById("qr-copy-feedback");
  var nameEl = document.getElementById("qr-restaurant-name");
  var body = document.body;

  function menuId() {
    var id = body.getAttribute("data-menu-id");
    if (id && String(id).trim()) return String(id).trim();
    var q = new URLSearchParams(window.location.search).get("id");
    if (q && String(q).trim()) return String(q).trim();
    return "demo";
  }

  function shareUrl() {
    var base = (body.getAttribute("data-share-url-base") || "").trim();
    var id = menuId();
    if (!base) {
      return "https://africamenu.app/menu/" + encodeURIComponent(id);
    }
    if (base.indexOf("://") === -1) {
      base = "https://" + base.replace(/^\/+/, "");
    }
    if (base.endsWith("/")) {
      return base + encodeURIComponent(id);
    }
    return base + "/" + encodeURIComponent(id);
  }

  function restaurantName() {
    var n = body.getAttribute("data-restaurant-name");
    return n && String(n).trim() ? String(n).trim() : "Le king";
  }

  /** Motif pseudo-QR déterministe (placeholder visuel, pas un vrai encodage) */
  function drawPlaceholderQr(ctx, size, seedStr) {
    var n = 29;
    var cell = size / n;
    var h = 0;
    var i;
    for (i = 0; i < seedStr.length; i++) {
      h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";

    function finder(x0, y0) {
      var dx;
      var dy;
      for (dy = 0; dy < 7; dy++) {
        for (dx = 0; dx < 7; dx++) {
          var on = dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
          if (on) {
            ctx.fillRect((x0 + dx) * cell, (y0 + dy) * cell, cell + 0.35, cell + 0.35);
          }
        }
      }
    }

    finder(0, 0);
    finder(n - 7, 0);
    finder(0, n - 7);

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (x < 9 && y < 9) continue;
        if (x >= n - 8 && y < 9) continue;
        if (x < 9 && y >= n - 8) continue;
        var t = ((h + x * 73856093 + y * 19349663) >>> 0) % 5;
        if (t === 0 || t === 1) {
          ctx.fillRect(x * cell, y * cell, cell + 0.35, cell + 0.35);
        }
      }
    }
  }

  function initCanvas() {
    if (!canvas) return;
    var display = 220;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(display * dpr);
    canvas.height = Math.round(display * dpr);
    canvas.style.width = display + "px";
    canvas.style.height = display + "px";
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlaceholderQr(ctx, display, shareUrl() + "|" + menuId());
  }

  function downloadPng() {
    if (!canvas) return;
    var link = document.createElement("a");
    link.download = "qrcode-africamenu-" + menuId() + ".png";
    link.href = canvas.toDataURL("image/png");
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function setCopyFeedback(msg, ok) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.hidden = false;
    feedback.classList.toggle("qr-copy-feedback--ok", !!ok);
    window.setTimeout(function () {
      feedback.hidden = true;
      feedback.textContent = "";
    }, 2200);
  }

  function copyUrl() {
    if (!urlInput) return;
    var text = urlInput.value || shareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          setCopyFeedback("Lien copié dans le presse-papiers.", true);
          if (copyBtn) copyBtn.classList.add("is-done");
          window.setTimeout(function () {
            if (copyBtn) copyBtn.classList.remove("is-done");
          }, 2000);
        },
        function () {
          urlInput.select();
          document.execCommand("copy");
          setCopyFeedback("Lien copié.", true);
        }
      );
    } else {
      urlInput.select();
      document.execCommand("copy");
      setCopyFeedback("Lien copié.", true);
    }
  }

  if (nameEl) {
    nameEl.textContent = restaurantName();
  }
  if (urlInput) {
    urlInput.value = shareUrl();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCanvas);
  } else {
    initCanvas();
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadPng);
  }
  if (copyBtn) {
    copyBtn.addEventListener("click", copyUrl);
  }
})();
