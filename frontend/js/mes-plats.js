/**
 * Page Mes plats — CRUD connecté à l'API.
 */
(function () {
  "use strict";

  const API_URL = window.MenuGo_CONFIG.API_URL;
  const TOKEN_KEY = "MenuGo_token";
  const USER_KEY = "MenuGo_user";
  const RESTAURANT_KEY = "MenuGo_restaurant";

  const form = document.getElementById("plats-form");
  const nameInput = document.getElementById("plats-name");
  const priceInput = document.getElementById("plats-price");
  const descriptionInput = document.getElementById("plats-description");
  const categorySelect = document.getElementById("plats-category");
  const imageInput = document.getElementById("plats-image");
  const imageFileInput = document.getElementById("plats-image-file");
  const imagePreview = document.getElementById("plats-image-preview");
  const hasSizesInput = document.getElementById("plats-has-sizes");
  const variantsSection = document.getElementById("plats-variants");
  const variantsList = document.getElementById("plats-variants-list");
  const addVariantBtn = document.getElementById("plats-variant-add");
  const submitBtn = document.getElementById("plats-submit");
  const cancelBtn = document.getElementById("plats-cancel");
  const list = document.getElementById("plats-list");
  const empty = document.getElementById("plats-empty");
  const status = document.getElementById("plats-status");
  const drawerRestaurant = document.getElementById("plats-drawer-restaurant");
  const drawerEmail = document.getElementById("plats-drawer-email");
  const logoutLink = document.getElementById("plats-logout");

  let products = [];
  let categories = [];
  let editingId = null;

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  function setStatus(message, isError) {
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  async function apiRequest(path, options) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    const response = await fetch(API_URL + path, {
      method: (options && options.method) || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = response.status === 204 ? {} : await readJson(response);
    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      return null;
    }
    if (!response.ok) {
      throw new Error(data.message || "Erreur API");
    }
    return data;
  }

  async function uploadImage(file) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch(API_URL + "/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: formData,
    });

    const data = response.status === 204 ? {} : await readJson(response);
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

  function getStoredJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (error) {
      return null;
    }
  }

  function renderAccountInfo(me) {
    const storedUser = getStoredJson(USER_KEY);
    const storedRestaurant = getStoredJson(RESTAURANT_KEY);
    const user = (me && me.user) || storedUser || {};
    const restaurant = (me && me.restaurant) || storedRestaurant || {};

    drawerRestaurant.textContent = restaurant.name || "Nom du resto";
    drawerEmail.textContent = user.email || "email du resto";

    if (me) {
      localStorage.setItem(USER_KEY, JSON.stringify(user || null));
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant || null));
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function resolveImageUrl(url) {
    if (!url) return "";
    return String(url).indexOf("/uploads/") === 0 ? API_URL + url : url;
  }

  function setImagePreview(preview, url) {
    if (!preview) return;
    if (!url) {
      preview.hidden = true;
      preview.removeAttribute("src");
      return;
    }
    preview.src = resolveImageUrl(url);
    preview.hidden = false;
  }

  function previewSelectedFile(input, preview) {
    const file = input && input.files ? input.files[0] : null;
    if (!file) return;
    setImagePreview(preview, URL.createObjectURL(file));
  }

  function findCategoryName(categoryId) {
    const category = categories.find(function (item) {
      return item.id === Number(categoryId);
    });
    return category ? category.name : "Sans catégorie";
  }

  function formatPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "0.00";
    }
    return number.toFixed(2);
  }

  function productHasSizes(product) {
    return product.has_sizes === true || product.has_sizes === 1 || product.has_sizes === "1";
  }

  function getDefaultVariants(product) {
    if (product && product.variants && product.variants.length) {
      return product.variants;
    }

    return [
      { name: "Petit", price: "" },
      { name: "Moyen", price: "" },
      { name: "Grand", price: "" },
    ];
  }

  function createVariantRow(variant) {
    const row = document.createElement("article");
    row.className = "plats-variant";
    row.innerHTML =
      '<div class="plats-variant__row">' +
      '<label class="plats-variant__label">Nom' +
      '<input class="plats-variant__input" data-variant-field="name" type="text" placeholder="Ex : Grand" value="' +
      escapeHtml(variant && variant.name ? variant.name : "") +
      '" />' +
      "</label>" +
      '<label class="plats-variant__label">Prix' +
      '<input class="plats-variant__input" data-variant-field="price" type="number" min="0" step="0.01" placeholder="Ex : 5000" value="' +
      escapeHtml(variant && variant.price != null ? formatPrice(variant.price) : "") +
      '" />' +
      "</label>" +
      "</div>" +
      '<button class="plats-variant__remove" type="button" data-action="remove-variant">Supprimer cette option</button>';
    return row;
  }

  function renderVariantRows(variants) {
    variantsList.innerHTML = "";
    variants.forEach(function (variant) {
      variantsList.appendChild(createVariantRow(variant));
    });
  }

  function setVariantsVisible(isVisible, product) {
    variantsSection.hidden = !isVisible;
    if (isVisible && !variantsList.children.length) {
      renderVariantRows(getDefaultVariants(product));
    }
    if (!isVisible) {
      variantsList.innerHTML = "";
    }
  }

  function readVariants() {
    return Array.from(variantsList.querySelectorAll(".plats-variant"))
      .map(function (row) {
        const name = row.querySelector("[data-variant-field='name']").value.trim();
        const price = Number(row.querySelector("[data-variant-field='price']").value);
        return {
          name: name,
          price: price,
        };
      })
      .filter(function (variant) {
        return variant.name && Number.isFinite(variant.price) && variant.price >= 0;
      });
  }

  async function uploadSelectedImages(currentImage) {
    let image = currentImage;

    if (imageFileInput.files && imageFileInput.files[0]) {
      setStatus("Upload de l'image du plat...");
      image = await uploadImage(imageFileInput.files[0]);
      imageInput.value = image || "";
    }

    return image;
  }

  function renderCategoryOptions() {
    categorySelect.innerHTML = "";

    if (!categories.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Créez d'abord une catégorie";
      categorySelect.appendChild(option);
      return;
    }

    categories.forEach(function (category) {
      const option = document.createElement("option");
      option.value = String(category.id);
      option.textContent = category.name;
      categorySelect.appendChild(option);
    });
  }

  function renderProducts() {
    list.innerHTML = "";

    if (!products.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.hidden = false;

    products.forEach(function (product) {
      const article = document.createElement("article");
      article.className = "plats-item";
      article.innerHTML =
        '<div class="cats-item__copy">' +
        '<p class="plats-item__name">' +
        escapeHtml(product.name) +
        "</p>" +
        '<p class="plats-item__meta">' +
        escapeHtml(findCategoryName(product.category_id)) +
        " · " +
        escapeHtml(formatPrice(product.price)) +
        (productHasSizes(product) ? " · Tailles disponibles" : " · Sans tailles") +
        (product.variants && product.variants.length ? " · " + product.variants.length + " option(s)" : "") +
        (product.description ? "<br>" + escapeHtml(product.description) : "") +
        "</p>" +
        "</div>" +
        '<div class="plats-item__actions">' +
        '<button type="button" class="plats-item__btn" data-action="edit-plat" data-id="' +
        product.id +
        '">Modifier</button>' +
        '<button type="button" class="plats-item__btn plats-item__btn--danger" data-action="delete-plat" data-id="' +
        product.id +
        '">Supprimer</button>' +
        "</div>";
      list.appendChild(article);
    });
  }

  function openForm(product) {
    if (!categories.length) {
      setStatus("Ajoutez d'abord une catégorie avant de créer un plat.", true);
      return;
    }

    editingId = product ? product.id : null;
    form.hidden = false;
    nameInput.value = product ? product.name : "";
    priceInput.value = product ? formatPrice(product.price) : "";
    descriptionInput.value = product && product.description ? product.description : "";
    categorySelect.value = product ? String(product.category_id) : String(categories[0].id);
    imageInput.value = product && product.image ? product.image : "";
    imageFileInput.value = "";
    setImagePreview(imagePreview, imageInput.value);
    hasSizesInput.checked = product ? productHasSizes(product) : false;
    renderVariantRows(getDefaultVariants(product));
    setVariantsVisible(hasSizesInput.checked, product);
    submitBtn.textContent = product ? "Modifier" : "Enregistrer";
    nameInput.focus();
  }

  function closeForm() {
    editingId = null;
    form.hidden = true;
    form.reset();
    variantsList.innerHTML = "";
    setImagePreview(imagePreview, "");
  }

  function onAddPlat() {
    setStatus("");
    openForm(null);
  }

  async function loadPage() {
    try {
      setStatus("Chargement des plats...");
      renderAccountInfo(null);

      const [me, categoriesData, productsData] = await Promise.all([
        apiRequest("/api/me"),
        apiRequest("/api/categories"),
        apiRequest("/api/products"),
      ]);

      if (!categoriesData || !productsData) return;

      renderAccountInfo(me);
      categories = categoriesData.categories || [];
      products = productsData.products || [];
      renderCategoryOptions();
      renderProducts();

      if (!categories.length) {
        setStatus("Ajoutez une catégorie avant de créer votre premier plat.", true);
      } else {
        setStatus(products.length ? "" : "Aucun plat pour le moment.");
      }
    } catch (error) {
      setStatus(error.message || "Impossible de charger les plats.", true);
    }
  }

  document.querySelectorAll("[data-action='add-plat']").forEach(function (el) {
    el.addEventListener("click", onAddPlat);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = nameInput.value.trim();
    const price = Number(priceInput.value);
    const categoryId = Number(categorySelect.value);
    const description = descriptionInput.value.trim();
    const image = imageInput.value.trim();

    if (!name) {
      setStatus("Le nom du plat est requis.", true);
      nameInput.focus();
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setStatus("Le prix doit être un nombre positif ou nul.", true);
      priceInput.focus();
      return;
    }
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      setStatus("Sélectionnez une catégorie valide.", true);
      categorySelect.focus();
      return;
    }

    let variants = hasSizesInput.checked ? readVariants() : [];
    if (hasSizesInput.checked && !variants.length) {
      setStatus("Ajoutez au moins une option avec un nom et un prix.", true);
      const firstVariantInput = variantsList.querySelector("[data-variant-field='price']");
      if (firstVariantInput) {
        firstVariantInput.focus();
      }
      return;
    }

    try {
      submitBtn.disabled = true;
      const wasEditing = Boolean(editingId);
      setStatus(wasEditing ? "Modification en cours..." : "Création en cours...");

      const uploadedImage = await uploadSelectedImages(image || null);
      variants = hasSizesInput.checked ? readVariants() : [];
      const body = {
        name: name,
        price: price,
        category_id: categoryId,
        description: description || null,
        image: uploadedImage || null,
        has_sizes: hasSizesInput.checked ? 1 : 0,
        variants: variants,
      };

      if (editingId) {
        await apiRequest("/api/products/" + encodeURIComponent(editingId), {
          method: "PUT",
          body: body,
        });
      } else {
        await apiRequest("/api/products", {
          method: "POST",
          body: body,
        });
      }

      closeForm();
      await loadPage();
      setStatus(wasEditing ? "Plat modifié." : "Plat ajouté.");
    } catch (error) {
      setStatus(error.message || "Enregistrement impossible.", true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", function () {
    closeForm();
    setStatus("");
  });

  imageFileInput.addEventListener("change", function () {
    previewSelectedFile(imageFileInput, imagePreview);
  });

  hasSizesInput.addEventListener("change", function () {
    setVariantsVisible(hasSizesInput.checked, null);
  });

  addVariantBtn.addEventListener("click", function () {
    variantsList.appendChild(createVariantRow({ name: "", price: "" }));
  });

  variantsList.addEventListener("click", function (event) {
    const removeBtn = event.target.closest("[data-action='remove-variant']");
    if (!removeBtn) return;
    removeBtn.closest(".plats-variant").remove();
  });

  list.addEventListener("click", async function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const id = Number(target.getAttribute("data-id"));
    const product = products.find(function (item) {
      return item.id === id;
    });
    if (!product) return;

    if (target.getAttribute("data-action") === "edit-plat") {
      setStatus("");
      openForm(product);
      return;
    }

    if (target.getAttribute("data-action") === "delete-plat") {
      const ok = window.confirm('Supprimer le plat "' + product.name + '" ?');
      if (!ok) return;

      try {
        setStatus("Suppression en cours...");
        await apiRequest("/api/products/" + encodeURIComponent(id), {
          method: "DELETE",
        });
        await loadPage();
        setStatus("Plat supprimé.");
      } catch (error) {
        setStatus(error.message || "Suppression impossible.", true);
      }
    }
  });

  logoutLink?.addEventListener("click", function () {
    clearSession();
  });

  loadPage();
})();
