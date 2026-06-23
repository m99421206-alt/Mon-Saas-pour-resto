/**
 * MenuGo — recadrage d'image avant upload (Cropper.js)
 * API : MenuGo_ImageCrop.open(file, options) → Promise<File>
 */
(function () {
  "use strict";

  var MODAL_ID = "mg-image-crop-modal";
  var DEFAULT_ASPECT = 5 / 4;
  var DEFAULT_OUTPUT_WIDTH = 1200;
  var JPEG_QUALITY = 0.92;

  var activeCropper = null;
  var activeObjectUrl = null;
  var activeResolve = null;
  var activeReject = null;
  var activeSourceFile = null;
  var activeOptions = null;

  function ensureModal() {
    if (document.getElementById(MODAL_ID)) {
      return;
    }

    var modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "mg-crop-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="mg-crop-modal__backdrop" data-action="crop-cancel" aria-hidden="true"></div>' +
      '<div class="mg-crop-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="mg-crop-modal-title">' +
      '<header class="mg-crop-modal__header">' +
      '<h2 class="mg-crop-modal__title" id="mg-crop-modal-title">Recadrer l\'image</h2>' +
      '<span class="mg-crop-modal__ratio" id="mg-crop-modal-ratio">5:4</span>' +
      "</header>" +
      '<div class="mg-crop-modal__stage">' +
      '<img class="mg-crop-modal__image" id="mg-crop-modal-image" alt="Image à recadrer" />' +
      "</div>" +
      '<div class="mg-crop-modal__controls">' +
      '<button type="button" class="mg-crop-modal__zoom-btn" data-action="crop-zoom-out" aria-label="Zoom arrière">−</button>' +
      '<input type="range" class="mg-crop-modal__zoom-range" id="mg-crop-modal-zoom" min="0" max="100" value="0" aria-label="Niveau de zoom" />' +
      '<button type="button" class="mg-crop-modal__zoom-btn" data-action="crop-zoom-in" aria-label="Zoom avant">+</button>' +
      "</div>" +
      '<p class="mg-crop-modal__hint">Déplacez et zoomez l\'image, puis validez le cadrage.</p>' +
      '<footer class="mg-crop-modal__footer">' +
      '<button type="button" class="mg-crop-modal__btn mg-crop-modal__btn--ghost" data-action="crop-cancel">Annuler</button>' +
      '<button type="button" class="mg-crop-modal__btn mg-crop-modal__btn--primary" data-action="crop-confirm">Valider</button>' +
      "</footer>" +
      "</div>";

    document.body.appendChild(modal);

    modal.addEventListener("click", function (event) {
      var action = event.target.closest("[data-action]");
      if (!action) {
        return;
      }
      var name = action.getAttribute("data-action");
      if (name === "crop-cancel") {
        cancelCrop();
      } else if (name === "crop-confirm") {
        confirmCrop();
      } else if (name === "crop-zoom-in") {
        zoomBy(0.08);
      } else if (name === "crop-zoom-out") {
        zoomBy(-0.08);
      }
    });

    var zoomRange = document.getElementById("mg-crop-modal-zoom");
    if (zoomRange) {
      zoomRange.addEventListener("input", function () {
        if (!activeCropper) {
          return;
        }
        var maxRatio = 3;
        var ratio = (Number(zoomRange.value) / 100) * maxRatio;
        activeCropper.zoomTo(Math.max(0, ratio));
      });
    }

    document.addEventListener("keydown", function (event) {
      var modal = getModal();
      if (!modal || modal.hidden) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelCrop();
      }
    });
  }

  function destroyCropper() {
    if (activeCropper) {
      activeCropper.destroy();
      activeCropper = null;
    }
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
  }

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function resetZoomRange() {
    var zoomRange = document.getElementById("mg-crop-modal-zoom");
    if (zoomRange) {
      zoomRange.value = "0";
    }
  }

  function syncZoomRange() {
    if (!activeCropper) {
      return;
    }
    var zoomRange = document.getElementById("mg-crop-modal-zoom");
    if (!zoomRange) {
      return;
    }
    var data = activeCropper.getData();
    var ratio = data && Number.isFinite(data.scaleX) ? Math.abs(data.scaleX) : 1;
    var min = 0;
    var max = 3;
    var normalized = Math.min(100, Math.max(0, ((ratio - min) / (max - min)) * 100));
    zoomRange.value = String(Math.round(normalized));
  }

  function zoomBy(step) {
    if (!activeCropper) {
      return;
    }
    activeCropper.zoom(step);
    syncZoomRange();
  }

  function finishPromise(file) {
    var resolve = activeResolve;
    activeResolve = null;
    activeReject = null;
    activeSourceFile = null;
    activeOptions = null;
    if (resolve) {
      resolve(file);
    }
  }

  function cancelCrop() {
    var reject = activeReject;
    destroyCropper();
    var modal = getModal();
    if (modal) {
      modal.hidden = true;
    }
    document.body.classList.remove("mg-crop-modal-open");
    activeResolve = null;
    activeReject = null;
    activeSourceFile = null;
    activeOptions = null;
    if (reject) {
      reject(new Error("Recadrage annulé."));
    }
  }

  function buildOutputFileName(sourceFile) {
    var original = sourceFile && sourceFile.name ? String(sourceFile.name) : "image";
    var base = original.replace(/\.[^.]+$/, "") || "image";
    return base.slice(0, 80) + ".jpg";
  }

  function confirmCrop() {
    if (!activeCropper || !activeResolve || !activeSourceFile) {
      return;
    }

    var opts = activeOptions || {};
    var outputWidth = opts.outputWidth != null ? opts.outputWidth : DEFAULT_OUTPUT_WIDTH;
    var aspectRatio = opts.aspectRatio != null ? opts.aspectRatio : DEFAULT_ASPECT;
    var outputHeight = Math.round(outputWidth / aspectRatio);

    var canvas = activeCropper.getCroppedCanvas({
      width: outputWidth,
      height: outputHeight,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    if (!canvas) {
      if (activeReject) {
        activeReject(new Error("Impossible de générer l'image recadrée."));
      }
      cancelCrop();
      return;
    }

    canvas.toBlob(
      function (blob) {
        if (!blob) {
          if (activeReject) {
            activeReject(new Error("Impossible de générer l'image recadrée."));
          }
          cancelCrop();
          return;
        }

        var croppedFile = new File([blob], buildOutputFileName(activeSourceFile), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });

        destroyCropper();
        var modal = getModal();
        if (modal) {
          modal.hidden = true;
        }
        document.body.classList.remove("mg-crop-modal-open");
        finishPromise(croppedFile);
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  function formatAspectLabel(ratio) {
    if (Math.abs(ratio - 5 / 4) < 0.01) {
      return "5:4";
    }
    if (Math.abs(ratio - 1) < 0.01) {
      return "1:1";
    }
    return ratio.toFixed(2).replace(/\.?0+$/, "") + ":1";
  }

  function openCropModal(file, options) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error("Aucun fichier sélectionné."));
        return;
      }
      if (typeof window.Cropper !== "function") {
        reject(new Error("Recadrage indisponible (Cropper.js)."));
        return;
      }

      ensureModal();

      activeResolve = resolve;
      activeReject = reject;
      activeSourceFile = file;
      activeOptions = options || {};

      var aspectRatio =
        activeOptions.aspectRatio != null ? activeOptions.aspectRatio : DEFAULT_ASPECT;
      var title = activeOptions.title || "Recadrer l'image";

      var modal = getModal();
      var img = document.getElementById("mg-crop-modal-image");
      var titleEl = document.getElementById("mg-crop-modal-title");
      var ratioEl = document.getElementById("mg-crop-modal-ratio");

      if (!modal || !img) {
        reject(new Error("Interface de recadrage indisponible."));
        return;
      }

      if (titleEl) {
        titleEl.textContent = title;
      }
      if (ratioEl) {
        ratioEl.textContent = formatAspectLabel(aspectRatio);
      }

      destroyCropper();
      resetZoomRange();

      activeObjectUrl = URL.createObjectURL(file);
      img.removeAttribute("style");
      img.src = activeObjectUrl;
      modal.hidden = false;
      document.body.classList.add("mg-crop-modal-open");

      img.onload = function onCropImageReady() {
        img.onload = null;
        activeCropper = new window.Cropper(img, {
          aspectRatio: aspectRatio,
          viewMode: 1,
          dragMode: "move",
          autoCropArea: 1,
          responsive: true,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          background: false,
          modal: true,
          zoomOnWheel: true,
          zoomOnTouch: true,
          toggleDragModeOnDblclick: false,
          ready: function () {
            syncZoomRange();
          },
          zoom: function () {
            syncZoomRange();
          },
        });
      };

      img.onerror = function () {
        var rejectFn = activeReject;
        destroyCropper();
        modal.hidden = true;
        document.body.classList.remove("mg-crop-modal-open");
        activeResolve = null;
        activeReject = null;
        activeSourceFile = null;
        activeOptions = null;
        if (rejectFn) {
          rejectFn(new Error("Impossible de charger l'image sélectionnée."));
        }
      };
    });
  }

  window.MenuGo_ImageCrop = {
    open: openCropModal,
    ASPECT_RATIO_PRODUCT: DEFAULT_ASPECT,
    OUTPUT_WIDTH_PRODUCT: DEFAULT_OUTPUT_WIDTH,
  };
})();
