/**
 * Page Mes Plats — gestion des plats (CRUD, upload, cropper, variantes).
 */
(function () {
  "use strict";

  // --- Safe Helpers & Fallbacks ---
  function safeEscapeHtml(value) {
    var domSafe = window.MenuGo_DOMSafe || window.MenuGo_DomSafe;
    if (domSafe && typeof domSafe.escapeHtml === "function") {
      return domSafe.escapeHtml(value);
    }
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeEscapeAttr(value) {
    var domSafe = window.MenuGo_DOMSafe || window.MenuGo_DomSafe;
    if (domSafe && typeof domSafe.escapeAttr === "function") {
      return domSafe.escapeAttr(value);
    }
    return safeEscapeHtml(value);
  }

  var API_URL =
    (window.MenuGo_CONFIG && window.MenuGo_CONFIG.API_URL) || "/api";
  var UPLOADS_URL =
    (window.MenuGo_CONFIG && window.MenuGo_CONFIG.UPLOADS_URL) || "/uploads";
  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";

  var mainEl = document.getElementById("mes-plats-main");
  var statusEl = document.getElementById("plats-status");
  var formEl = document.getElementById("plats-form");
  var listEl = document.getElementById("plats-list");
  var emptyEl = document.getElementById("plats-empty");
  var submitBtn = document.getElementById("plats-submit");
  var cancelBtn = document.getElementById("plats-cancel");

  var nameInput = document.getElementById("plats-name");
  var priceInput = document.getElementById("plats-price");
  var descInput = document.getElementById("plats-description");
  var categorySelect = document.getElementById("plats-category");
  var imageInput = document.getElementById("plats-image");
  var imageFileInput = document.getElementById("plats-image-file");
  var imagePreview = document.getElementById("plats-image-preview");
  var dropzone = document.getElementById("plats-dropzone");
  var dropzoneContent = document.getElementById("plats-dropzone-content");
  var isVisibleCheck = document.getElementById("plats-is-visible");
  var hasSizesCheck = document.getElementById("plats-has-sizes");

  var variantsSection = document.getElementById("plats-variants");
  var variantsList = document.getElementById("plats-variants-list");
  var variantAddBtn = document.getElementById("plats-variant-add");

  var drawerRestaurant = document.getElementById("plats-drawer-restaurant");
  var drawerEmail = document.getElementById("plats-drawer-email");
  var logoutLink = document.getElementById("plats-logout");

  if (!mainEl || !formEl) return;

  var currentEditingId = null;
  var categoriesCache = [];
  var isSubmitting = false;

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.hidden = !message;
    statusEl.classList.toggle("is-error", Boolean(isError));
    if (isError && message && window.MenuGo_Toast) {
      window.MenuGo_Toast.error(message);
    }
  }

  function getStoredJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (e) {
      return {};
    }
  }

  async function apiRequest(path, options) {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    var cleanPath = path.startsWith("/") ? path : "/" + path;
    if (API_URL.endsWith("/api") && cleanPath.startsWith("/api/")) {
      cleanPath = cleanPath.substring(4);
    }

    var response = await fetch(API_URL + cleanPath, {
      method: (options && options.method) || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });

    var data = response.status === 204 ? {} : await readJson(response);

    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      return null;
    }
    if (!response.ok) {
      throw new Error(data.message || "Erreur serveur.");
    }
    return data;
  }

  async function uploadImage(file) {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    var formData = new FormData();
    formData.append("image", file);

    var uploadPath = API_URL.endsWith("/api")
      ? API_URL + "/upload"
      : API_URL + "/api/upload";

    var response = await fetch(uploadPath, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: formData,
    });

    var data = response.status === 204 ? {} : await readJson(response);
    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      return null;
    }
    if (!response.ok) {
      throw new Error(data.message || "Upload impossible.");
    }
    return data.url;
  }

  function resolveImageUrl(url) {
    if (!url) return "";
    var strUrl = String(url).trim();
    if (!strUrl) return "";
    var base = String(UPLOADS_URL || "/uploads").replace(/\/+$/, "");
    if (/^(javascript|data|vbscript):/i.test(strUrl)) {
      return "";
    }
    if (/^(blob:|https?:\/\/)/i.test(strUrl)) {
      return strUrl;
    }
    if (
      window.MenuGo_DomSafe &&
      typeof window.MenuGo_DomSafe.sanitizeImageSrc === "function"
    ) {
      return window.MenuGo_DomSafe.sanitizeImageSrc(strUrl, base) || "";
    }
    return strUrl;
  }

  var UPLOAD_REJECT_MESSAGE =
    "Type de fichier non autorisé. Formats acceptés : JPG, JPEG, PNG, WEBP.";

  function isAllowedImageFile(file) {
    if (!file) return false;
    var name = String(file.name || "").toLowerCase();
    var blocked = [
      ".php",
      ".phtml",
      ".phar",
      ".exe",
      ".js",
      ".mjs",
      ".cjs",
      ".html",
      ".htm",
      ".svg",
      ".sh",
      ".bat",
      ".cmd",
      ".com",
      ".dll",
      ".msi",
      ".vbs",
      ".ps1",
      ".asp",
      ".aspx",
      ".jsp",
    ];
    if (
      blocked.some(function (ext) {
        return name.indexOf(ext) !== -1;
      })
    ) {
      return false;
    }
    var dot = name.lastIndexOf(".");
    var extension = dot >= 0 ? name.slice(dot) : "";
    var allowedExt = [".jpg", ".jpeg", ".png", ".webp"];
    if (allowedExt.indexOf(extension) === -1) return false;
    var mime = String(file.type || "").toLowerCase();
    if (
      mime &&
      mime !== "application/octet-stream" &&
      !/^(image\/(jpeg|jpg|pjpeg|png|x-png|webp))$/i.test(mime)
    ) {
      return false;
    }
    return true;
  }

  function setImagePreview(url) {
    if (!imagePreview) return;
    if (!url) {
      imagePreview.hidden = true;
      imagePreview.removeAttribute("src");
      if (dropzone) dropzone.classList.remove("has-preview");
      if (dropzoneContent) dropzoneContent.hidden = false;
      return;
    }
    imagePreview.src = resolveImageUrl(url);
    imagePreview.hidden = false;
    if (dropzone) dropzone.classList.add("has-preview");
    if (dropzoneContent) dropzoneContent.hidden = true;
  }

  function processImageFileWithCrop(file) {
    if (!file) {
      setImagePreview(imageInput ? imageInput.value : "");
      return;
    }
    if (!isAllowedImageFile(file)) {
      if (imageFileInput) imageFileInput.value = "";
      setImagePreview(imageInput ? imageInput.value : "");
      setStatus(UPLOAD_REJECT_MESSAGE, true);
      return;
    }
    setStatus("");
    if (window.MenuGo_CropModal) {
      window.MenuGo_CropModal.open(file, function (croppedFile) {
        var transfer = new DataTransfer();
        transfer.items.add(croppedFile);
        if (imageFileInput) imageFileInput.files = transfer.files;
        setImagePreview(URL.createObjectURL(croppedFile));
      });
    } else {
      setImagePreview(URL.createObjectURL(file));
    }
  }

  function previewSelectedFile() {
    var file =
      imageFileInput && imageFileInput.files ? imageFileInput.files[0] : null;
    processImageFileWithCrop(file);
  }

  function initDropzone() {
    if (!dropzone || !imageFileInput) return;

    dropzone.addEventListener("click", function (e) {
      if (e.target === imageFileInput) return;
      imageFileInput.click();
    });

    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        imageFileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (e) {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (e) {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
      });
    });

    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("is-dragover");

      var file =
        e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
      if (!file || !isAllowedImageFile(file)) {
        if (file) setStatus(UPLOAD_REJECT_MESSAGE, true);
        return;
      }
      var transfer = new DataTransfer();
      transfer.items.add(file);
      imageFileInput.files = transfer.files;
      previewSelectedFile();
    });

    imageFileInput.addEventListener("change", previewSelectedFile);
  }

  function renderAccountInfo(user, restaurant) {
    var name = restaurant && restaurant.name ? restaurant.name : "Nom du resto";
    if (drawerRestaurant) drawerRestaurant.textContent = name;
    if (drawerEmail)
      drawerEmail.textContent =
        user && user.email ? user.email : "email du resto";
    if (window.MenuGo_DashShell) {
      window.MenuGo_DashShell.populateProfile(user, restaurant);
    }
  }

  function populateCategoriesSelect(categories) {
    if (!categorySelect) return;
    categorySelect.innerHTML = "";
    if (!categories || categories.length === 0) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Aucune catégorie disponible";
      categorySelect.appendChild(opt);
      return;
    }
    categories.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = String(cat.id);
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  function createVariantRow(variant) {
    var row = document.createElement("div");
    row.className = "plats-variant-row";

    var nameVal = variant && variant.name ? variant.name : "";
    var priceVal = variant && variant.price !== undefined ? variant.price : "";

    row.innerHTML =
      '<div class="plats-variant-row__fields">' +
      '<input type="text" class="plats-form__input variant-name" placeholder="Ex: Petit / Normal / Grand" value="' +
      safeEscapeAttr(nameVal) +
      '" required />' +
      '<input type="number" step="0.01" min="0" class="plats-form__input variant-price" placeholder="Prix" value="' +
      safeEscapeAttr(priceVal) +
      '" required />' +
      "</div>" +
      '<button type="button" class="plats-variant-row__remove" aria-label="Supprimer l\'option">&times;</button>';

    row
      .querySelector(".plats-variant-row__remove")
      .addEventListener("click", function () {
        row.remove();
      });

    return row;
  }

  function addVariantRow(variant) {
    if (!variantsList) return;
    variantsList.appendChild(createVariantRow(variant));
  }

  function collectVariants() {
    if (!hasSizesCheck || !hasSizesCheck.checked) return [];
    var rows = variantsList
      ? Array.from(variantsList.querySelectorAll(".plats-variant-row"))
      : [];
    var result = [];

    for (var i = 0; i < rows.length; i++) {
      var nameEl = rows[i].querySelector(".variant-name");
      var priceEl = rows[i].querySelector(".variant-price");
      var vName = nameEl ? nameEl.value.trim() : "";
      var vPrice = priceEl ? parseFloat(priceEl.value) : NaN;

      if (!vName) {
        throw new Error("Le nom de chaque variante est requis.");
      }
      if (isNaN(vPrice) || vPrice < 0) {
        throw new Error(
          "Le prix de chaque variante doit être un nombre valide.",
        );
      }

      result.push({ name: vName, price: vPrice });
    }

    if (result.length === 0) {
      throw new Error(
        "Veuillez ajouter au moins une variante ou décocher l'option.",
      );
    }

    return result;
  }

  function toggleVariantsSection() {
    var active = Boolean(hasSizesCheck && hasSizesCheck.checked);
    if (variantsSection) variantsSection.hidden = !active;
    if (active && variantsList && variantsList.children.length === 0) {
      addVariantRow();
    }
  }

  function resetFormState() {
    if (formEl) formEl.reset();
    if (nameInput) nameInput.value = "";
    if (priceInput) priceInput.value = "";
    if (descInput) descInput.value = "";
    if (categorySelect) categorySelect.value = "";
    if (imageInput) imageInput.value = "";
    if (imageFileInput) imageFileInput.value = "";
    if (isVisibleCheck) isVisibleCheck.checked = true;
    if (hasSizesCheck) hasSizesCheck.checked = false;
    if (variantsList) variantsList.innerHTML = "";
    setImagePreview("");
    toggleVariantsSection();
  }

  function showForm(itemToEdit) {
    setStatus("");
    formEl.hidden = false;
    if (listEl) listEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    currentEditingId = itemToEdit ? itemToEdit.id : null;
    if (imageFileInput) imageFileInput.value = "";

    if (itemToEdit) {
      nameInput.value = itemToEdit.name || "";
      priceInput.value = itemToEdit.price !== undefined ? itemToEdit.price : "";
      descInput.value = itemToEdit.description || "";
      if (categorySelect && itemToEdit.category_id) {
        categorySelect.value = String(itemToEdit.category_id);
      }
      if (imageInput) imageInput.value = itemToEdit.image || "";
      setImagePreview(itemToEdit.image || "");
      if (isVisibleCheck)
        isVisibleCheck.checked = Boolean(itemToEdit.is_visible);
      if (hasSizesCheck) hasSizesCheck.checked = Boolean(itemToEdit.has_sizes);

      if (variantsList) variantsList.innerHTML = "";
      if (itemToEdit.has_sizes && Array.isArray(itemToEdit.variants)) {
        itemToEdit.variants.forEach(function (v) {
          addVariantRow(v);
        });
      }
    } else {
      resetFormState();
    }

    toggleVariantsSection();
    window.requestAnimationFrame(function () {
      if (formEl && !formEl.hidden) {
        formEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function hideForm() {
    resetFormState();
    formEl.hidden = true;
    currentEditingId = null;
    if (imageFileInput) imageFileInput.value = "";
    loadPlats();
  }
  function renderPlatsList(items) {
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = "";

    if (!items || !items.length) {
      listEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    items.forEach(function (product) {
      var article = document.createElement("article");

      var visible =
        product.is_visible === true ||
        product.is_visible === 1 ||
        product.is_visible === "1";

      var hasImage = Boolean(product.image && String(product.image).trim());

      article.className =
        "plats-card" +
        (hasImage ? "" : " plats-card--no-media") +
        (visible ? "" : " plats-card--hidden");

      var category = categoriesCache.find(function (c) {
        return Number(c.id) === Number(product.category_id);
      });

      var categoryName = category ? category.name : "Sans catégorie";

      var priceLabel;

      if (
        product.has_sizes &&
        Array.isArray(product.variants) &&
        product.variants.length
      ) {
        var prices = product.variants
          .map(function (v) {
            return Number(v.price);
          })
          .filter(Number.isFinite);

        if (prices.length) {
          var min = Math.min.apply(null, prices);
          var max = Math.max.apply(null, prices);

          if (min === max) {
            priceLabel = min.toLocaleString("fr-FR") + " F CFA";
          } else {
            priceLabel =
              min.toLocaleString("fr-FR") +
              " F CFA – " +
              max.toLocaleString("fr-FR") +
              " F CFA";
          }
        } else {
          priceLabel = "0 F CFA";
        }
      } else {
        priceLabel =
          Number(product.price || 0).toLocaleString("fr-FR") + " F CFA";
      }

      article.innerHTML =
        '<div class="plats-card__body">' +
        (visible
          ? ""
          : '<span class="plats-card__hidden-badge">Masqué du menu</span>') +
        '<span class="plats-card__category">' +
        safeEscapeHtml(categoryName) +
        "</span>" +
        '<h3 class="plats-card__name">' +
        safeEscapeHtml(product.name) +
        "</h3>" +
        '<p class="plats-card__price">' +
        safeEscapeHtml(priceLabel) +
        "</p>" +
        (product.description
          ? '<p class="plats-card__desc">' +
            safeEscapeHtml(product.description) +
            "</p>"
          : "") +
        "</div>" +
        '<div class="plats-card__footer">' +
        '<label class="plats-card__visible">' +
        '<input type="checkbox" class="toggle-visible" ' +
        'data-id="' +
        product.id +
        '"' +
        (visible ? " checked" : "") +
        ">" +
        "<span>Visible</span>" +
        "</label>" +
        '<div class="plats-card__actions">' +
        '<button type="button" class="plats-card__btn edit-btn">Modifier</button>' +
        '<button type="button" class="plats-card__btn plats-card__btn--danger delete-btn">Supprimer</button>' +
        "</div>" +
        "</div>";

      var visibleToggle = article.querySelector(".toggle-visible");
      if (visibleToggle) {
        visibleToggle.addEventListener("change", async function () {
          var checkbox = this;
          var nextVisible = Boolean(checkbox.checked);
          var card = checkbox.closest(".plats-card");
          var previousVisible = Boolean(visible);

          if (card) {
            card.classList.toggle("plats-card--hidden", !nextVisible);
          }

          checkbox.disabled = true;
          setStatus("Mise à jour de la visibilité...");

          try {
            await apiRequest("/products/" + product.id, {
              method: "PUT",
              body: { is_visible: nextVisible },
            });
            product.is_visible = nextVisible;
            visible = nextVisible;
            if (window.MenuGo_Toast) {
              window.MenuGo_Toast.success(
                nextVisible ? "Plat rendu visible." : "Plat masqué.",
              );
            }
            setStatus("");
          } catch (err) {
            checkbox.checked = previousVisible;
            if (card) {
              card.classList.toggle("plats-card--hidden", !previousVisible);
            }
            setStatus(err.message || "Mise à jour impossible.", true);
          } finally {
            checkbox.disabled = false;
          }
        });
      }

      article.querySelector(".edit-btn").addEventListener("click", function () {
        showForm(product);
      });

      article
        .querySelector(".delete-btn")
        .addEventListener("click", function () {
          deletePlat(product.id);
        });

      listEl.appendChild(article);
    });
  }

  async function loadPlats() {
    try {
      setStatus("Chargement des plats...");

      var storedUser = getStoredJson(USER_KEY);
      var storedRestaurant = getStoredJson(RESTAURANT_KEY);
      renderAccountInfo(storedUser, storedRestaurant);

      var me = await apiRequest("/me");
      if (me && me.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(me.user));
        localStorage.setItem(RESTAURANT_KEY, JSON.stringify(me.restaurant));
        renderAccountInfo(me.user, me.restaurant);
      }

      var catsRes = await apiRequest("/categories");
      categoriesCache = (catsRes && catsRes.categories) || [];
      populateCategoriesSelect(categoriesCache);

      var itemsRes = await apiRequest("/products");
      var items = Array.isArray(itemsRes)
        ? itemsRes
        : itemsRes && itemsRes.products
          ? itemsRes.products
          : [];
      renderPlatsList(items);
      setStatus("");
    } catch (e) {
      setStatus(e.message || "Erreur de chargement.", true);
    }
  }

  async function deletePlat(id) {
    if (!confirm("Voulez-vous vraiment supprimer ce plat ?")) return;
    try {
      setStatus("Suppression en cours...");
      await apiRequest("/products/" + id, { method: "DELETE" });
      if (window.MenuGo_Toast) window.MenuGo_Toast.success("Plat supprimé.");
      loadPlats();
    } catch (e) {
      setStatus(e.message || "Erreur de suppression.", true);
    }
  }

  formEl.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (isSubmitting) return;

    var name = nameInput.value.trim();
    var price = parseFloat(priceInput.value);
    var categoryId = categorySelect ? categorySelect.value : null;

    if (!name) {
      setStatus("Le nom du plat est requis.", true);
      nameInput.focus();
      return;
    }

    if (!categoryId) {
      setStatus("Veuillez sélectionner une catégorie.", true);
      return;
    }

    var hasSizes = Boolean(hasSizesCheck && hasSizesCheck.checked);
    if (!hasSizes && (isNaN(price) || price < 0)) {
      setStatus("Veuillez saisir un prix valide.", true);
      priceInput.focus();
      return;
    }

    var variants = [];
    try {
      variants = collectVariants();
    } catch (err) {
      setStatus(err.message, true);
      return;
    }

    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;
    setStatus("Enregistrement du plat...");

    try {
      var imageUrl = imageInput ? imageInput.value.trim() : "";

      if (imageFileInput && imageFileInput.files && imageFileInput.files[0]) {
        setStatus("Téléversement de l'image...");
        imageUrl = await uploadImage(imageFileInput.files[0]);
      }

      var payload = {
        name: name,
        price: hasSizes ? (variants[0] ? variants[0].price : 0) : price,
        description: descInput ? descInput.value.trim() : "",
        category_id: parseInt(categoryId, 10),
        image: imageUrl || null,
        is_visible: Boolean(isVisibleCheck && isVisibleCheck.checked),
        has_sizes: hasSizes,
        variants: variants,
      };

      setStatus("Enregistrement des données...");
      if (currentEditingId) {
        await apiRequest("/products/" + currentEditingId, {
          method: "PUT",
          body: payload,
        });
        if (window.MenuGo_Toast)
          window.MenuGo_Toast.success("Plat mis à jour.");
      } else {
        await apiRequest("/products", {
          method: "POST",
          body: payload,
        });
        if (window.MenuGo_Toast) window.MenuGo_Toast.success("Plat ajouté.");
      }

      resetFormState();
      hideForm();
    } catch (err) {
      setStatus(err.message || "Impossible d'enregistrer le plat.", true);
    } finally {
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      hideForm();
    });
  }

  document.querySelectorAll('[data-action="add-plat"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      showForm(null);
    });
  });

  if (hasSizesCheck) {
    hasSizesCheck.addEventListener("change", toggleVariantsSection);
  }

  if (variantAddBtn) {
    variantAddBtn.addEventListener("click", function () {
      addVariantRow();
    });
  }

  if (logoutLink) {
    logoutLink.addEventListener("click", clearSession);
  }

  initDropzone();
  loadPlats();
})();
