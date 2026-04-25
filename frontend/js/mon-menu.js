/**
 * AfricaMenu - menu client mobile.
 * Charge le menu public depuis GET /menu/:restaurantId.
 */
(function () {
  "use strict";

  const restaurantTitle = document.getElementById("restaurant-short-name");
  const restaurantName = document.getElementById("restaurant-name");
  const restaurantDescription = document.getElementById("restaurant-description");
  const categoryList = document.getElementById("category-list");
  const productStrip = document.getElementById("product-strip");
  const viewAllBtn = document.getElementById("view-all-products");
  const whatsappLink = document.getElementById("whatsapp-order");

  const API_URL = "http://localhost:4000";
  const RESTAURANT_KEY = "africamenu_restaurant";
  const WHATSAPP_NUMBER = "22300000000";
  const WHATSAPP_MESSAGE = "Bonjour, je souhaite commander";

  function getStoredRestaurant() {
    try {
      return JSON.parse(localStorage.getItem(RESTAURANT_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function resolveRestaurantId() {
    const idFromUrl = new URLSearchParams(window.location.search).get("id");
    if (idFromUrl && String(idFromUrl).trim()) {
      return String(idFromUrl).trim();
    }

    const storedRestaurant = getStoredRestaurant();
    if (storedRestaurant && storedRestaurant.id) {
      return String(storedRestaurant.id);
    }

    return "";
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  async function loadMenuData() {
    const restaurantId = resolveRestaurantId();
    if (!restaurantId) {
      throw new Error("Aucun restaurant à afficher. Ouvrez un lien de menu valide.");
    }

    const response = await fetch(API_URL + "/menu/" + encodeURIComponent(restaurantId));
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data.message || "Menu introuvable.");
    }

    return data;
  }

  function formatPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "";
    }
    return new Intl.NumberFormat("fr-FR").format(number) + " FCFA";
  }

  function createEmptyState(text) {
    const empty = document.createElement("p");
    empty.className = "menu-empty";
    empty.textContent = text;
    return empty;
  }

  function createCategoryCard(category) {
    const button = document.createElement("button");
    button.className = "category-card";
    button.type = "button";
    button.dataset.categoryId = category.id;

    const image = document.createElement("span");
    image.className = "category-card__image";
    image.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "category-card__name";
    name.textContent = category.name;

    const arrow = document.createElement("span");
    arrow.className = "category-card__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";

    button.appendChild(image);
    button.appendChild(name);
    button.appendChild(arrow);
    return button;
  }

  function createProductCard(product) {
    const article = document.createElement("article");
    article.className = "product-card";

    const image = document.createElement("div");
    image.className = "product-card__image";
    image.setAttribute("aria-label", "Image du produit");
    if (product.image) {
      image.style.backgroundImage = 'url("' + String(product.image).replace(/"/g, "%22") + '")';
    }

    const body = document.createElement("div");
    body.className = "product-card__body";

    const name = document.createElement("h3");
    name.className = "product-card__name";
    name.textContent = product.name;

    const price = document.createElement("p");
    price.className = "product-card__price";
    price.textContent = formatPrice(product.price);

    body.appendChild(name);
    body.appendChild(price);
    article.appendChild(image);
    article.appendChild(body);
    return article;
  }

  function renderRestaurant(restaurant) {
    const name = restaurant.name || "AfricaMenu";
    restaurantTitle.textContent = name;
    restaurantName.textContent = name;
    restaurantDescription.textContent =
      restaurant.description || "Découvrez notre menu et commandez facilement.";

    const logoText = document.querySelector(".restaurant-card__logo span");
    if (logoText) {
      logoText.textContent = name.split(/\s+/).slice(0, 2).join(" ").toUpperCase();
    }
  }

  function renderCategories(categories) {
    categoryList.innerHTML = "";

    if (!categories.length) {
      categoryList.appendChild(createEmptyState("Aucune catégorie disponible."));
      return;
    }

    categories.forEach(function (category) {
      categoryList.appendChild(createCategoryCard(category));
    });
  }

  function renderProducts(products) {
    productStrip.innerHTML = "";

    if (!products.length) {
      productStrip.appendChild(createEmptyState("Aucun produit disponible."));
      return;
    }

    products.forEach(function (product) {
      productStrip.appendChild(createProductCard(product));
    });
  }

  function flattenProducts(categories) {
    const products = [];
    categories.forEach(function (category) {
      (category.products || []).forEach(function (product) {
        products.push(product);
      });
    });
    return products;
  }

  function configureWhatsapp(restaurant) {
    const number = String(restaurant.whatsapp || WHATSAPP_NUMBER).replace(/[^0-9]/g, "");
    const text = encodeURIComponent(WHATSAPP_MESSAGE);
    whatsappLink.href = "https://wa.me/" + encodeURIComponent(number) + "?text=" + text;
  }

  function bindInteractions() {
    categoryList.addEventListener("click", function (event) {
      const card = event.target.closest(".category-card");
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    viewAllBtn.addEventListener("click", function () {
      productStrip.scrollTo({ left: productStrip.scrollWidth, behavior: "smooth" });
    });
  }

  async function init() {
    try {
      const data = await loadMenuData();
      const categories = data.categories || [];

      renderRestaurant(data.restaurant || {});
      renderCategories(categories);
      renderProducts(flattenProducts(categories));
      configureWhatsapp(data.restaurant || {});
      bindInteractions();
    } catch (error) {
      renderRestaurant({
        name: "AfricaMenu",
        description: error.message || "Impossible de charger ce menu.",
      });
      renderCategories([]);
      renderProducts([]);
      configureWhatsapp({});
    }
  }

  init();
})();
