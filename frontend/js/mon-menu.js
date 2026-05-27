const API_BASE_URL = window.MenuGo_CONFIG.API_URL;
const DEFAULT_PRODUCT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='420' viewBox='0 0 600 420'%3E%3Crect width='600' height='420' fill='%23f3f4f6'/%3E%3Ctext x='300' y='210' text-anchor='middle' dominant-baseline='middle' font-family='Arial,sans-serif' font-size='24' fill='%239ca3af'%3EImage indisponible%3C/text%3E%3C/svg%3E";

function getTrimmedDescription(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function hasVisibleDescription(value) {
  return getTrimmedDescription(value).length > 0;
}

let categories = [{ id: "all", name: "Tout" }];
let products = [];

const categoriesEl = document.getElementById("categories");
const productsEl = document.getElementById("products");
const whatsappEl = document.getElementById("whatsapp");
const bottomNavEl = document.querySelector(".bottom-nav");
const homeNavEl = document.getElementById("home-nav");
const cartNavEl = document.getElementById("cart-nav");
const favoritesNavEl = document.getElementById("favorites-nav");
const cartToastEl = document.getElementById("cart-toast");
const productDetailEl = document.getElementById("product-detail");
const detailBackEl = document.getElementById("detail-back");
const detailImageEl = document.getElementById("detail-image");
const detailTitleEl = document.getElementById("detail-title");
const detailPriceEl = document.getElementById("detail-price");
const detailDescriptionEl = document.getElementById("detail-description");
const detailSizeGroupEl = document.getElementById("detail-size-group");
const sizeOptionsEl = document.getElementById("size-options");
const similarProductsEl = document.getElementById("similar-products");
const quantityMinusEl = document.getElementById("quantity-minus");
const quantityPlusEl = document.getElementById("quantity-plus");
const quantityValueEl = document.getElementById("quantity-value");
const detailAddEl = document.getElementById("detail-add");
const detailOrderEl = document.getElementById("detail-order");
const orderPageEl = document.getElementById("order-page");
const orderBackEl = document.getElementById("order-back");
const orderListEl = document.getElementById("order-list");
const orderTotalEl = document.getElementById("order-total");
const orderSubmitEl = document.getElementById("order-submit");
let whatsappNumber = "22399421206";

let activeCategory = "all";
let selectedProduct = null;
let selectedVariant = null;
let quantity = 1;
let orderItems = [];
let toastTimeout;
let orderPreviousView = "menu";
let favoriteIds = loadFavoriteIds();

function loadFavoriteIds() {
  try {
    return JSON.parse(localStorage.getItem("MenuGo_favorites")) || [];
  } catch (error) {
    return [];
  }
}

function saveFavoriteIds() {
  localStorage.setItem("MenuGo_favorites", JSON.stringify(favoriteIds));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isFavorite(productId) {
  return favoriteIds.includes(productId);
}

function getFavoriteIconClass(productId) {
  return isFavorite(productId) ? "fa-solid" : "fa-regular";
}

function updateFavoriteButton(button, productId) {
  const icon = button.querySelector("i");
  const favorite = isFavorite(productId);

  button.classList.toggle("is-favorite", favorite);
  button.setAttribute("aria-pressed", String(favorite));
  icon.className = `${getFavoriteIconClass(productId)} fa-heart`;
}

function setActiveNav(activeItem) {
  [homeNavEl, favoritesNavEl, cartNavEl].forEach(function (item) {
    item.classList.toggle("active", item === activeItem);
    if (item === activeItem) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

function toggleFavorite(productId, button) {
  if (isFavorite(productId)) {
    favoriteIds = favoriteIds.filter(function (id) {
      return id !== productId;
    });
  } else {
    favoriteIds.push(productId);
  }

  saveFavoriteIds();
  updateFavoriteButton(button, productId);
  button.classList.remove("is-bouncing");
  void button.offsetWidth;
  button.classList.add("is-bouncing");
}

function getRestaurantIdFromUrl() {
  const idFromUrl = new URLSearchParams(window.location.search).get("id");
  if (idFromUrl) {
    return idFromUrl;
  }

  try {
    const storedRestaurant = JSON.parse(localStorage.getItem("MenuGo_restaurant") || "null");
    return storedRestaurant && storedRestaurant.id ? String(storedRestaurant.id) : null;
  } catch (error) {
    return null;
  }
}

function formatApiPrice(price) {
  const value = Number(price);
  if (!Number.isFinite(value)) {
    return "0 CFA";
  }

  return `${Math.round(value).toLocaleString("fr-FR")} CFA`;
}

function normalizeImageUrl(imageUrl, fallbackUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    return fallbackUrl;
  }

  const url = imageUrl.trim();
  if (!url) {
    return fallbackUrl;
  }
  return url.indexOf("/uploads/") === 0 ? API_BASE_URL + url : url;
}

function normalizeWhatsapp(value) {
  if (!value || typeof value !== "string") {
    return whatsappNumber;
  }

  return value.replace(/[^\d]/g, "") || whatsappNumber;
}

function isValidThemeColor(value) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

function hexToRgb(hexColor) {
  const normalized = hexColor.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function applyThemeColor(value) {
  if (!isValidThemeColor(value)) {
    return;
  }

  const color = value.trim();
  const rgb = hexToRgb(color);
  document.documentElement.style.setProperty("--primary", color);
  document.documentElement.style.setProperty("--primary-soft", color + "1f");
  document.documentElement.style.setProperty("--primary-shadow", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`);
}

function applyRestaurantData(restaurant) {
  const heroBannerFrame = document.getElementById("hero-banner-frame");
  const heroCoverEl = document.getElementById("hero-cover");
  const restaurantNameEl = document.getElementById("restaurant-name");
  const restaurantDescriptionEl = document.getElementById("restaurant-description");
  const restaurantLogoEl = document.getElementById("restaurant-logo");
  const restaurantLogoWrap = document.getElementById("restaurant-logo-wrap");

  if (!restaurant) {
    return;
  }

  if (restaurant.name && restaurantNameEl) {
    restaurantNameEl.textContent = restaurant.name;
    document.title = `${restaurant.name} - MenuGo`;
  }

  if (restaurantDescriptionEl) {
    const desc = getTrimmedDescription(restaurant.description);
    if (desc) {
      restaurantDescriptionEl.textContent = desc;
      restaurantDescriptionEl.removeAttribute("hidden");
    } else {
      restaurantDescriptionEl.textContent = "";
      restaurantDescriptionEl.hidden = true;
    }
  }

  if (heroCoverEl && heroBannerFrame) {
    const bUrl = restaurant.banner_url ? String(restaurant.banner_url).trim() : "";
    if (bUrl) {
      heroCoverEl.hidden = false;
      heroCoverEl.src = normalizeImageUrl(bUrl, "");
      heroCoverEl.alt = `Bannière ${restaurant.name || "du restaurant"}`;
      heroBannerFrame.classList.remove("is-empty");
    } else {
      heroCoverEl.hidden = true;
      heroCoverEl.removeAttribute("src");
      heroCoverEl.alt = "";
      heroBannerFrame.classList.add("is-empty");
    }
  }

  if (restaurantLogoEl && restaurantLogoWrap) {
    const logoUrl = restaurant.logo_url ? String(restaurant.logo_url).trim() : "";
    if (logoUrl) {
      restaurantLogoEl.hidden = false;
      restaurantLogoEl.src = normalizeImageUrl(logoUrl, "");
      restaurantLogoEl.alt = `Logo ${restaurant.name || "du restaurant"}`;
      restaurantLogoWrap.classList.remove("is-empty");
    } else {
      restaurantLogoEl.hidden = true;
      restaurantLogoEl.removeAttribute("src");
      restaurantLogoEl.alt = "";
      restaurantLogoWrap.classList.add("is-empty");
    }
  }

  applyThemeColor(restaurant.theme_color);

  whatsappNumber = normalizeWhatsapp(restaurant.whatsapp);
  whatsappEl.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    "Bonjour, je souhaite commander"
  )}`;
}

function mapPublicMenuData(data) {
  const apiCategories = Array.isArray(data.categories) ? data.categories : [];

  categories = [{ id: "all", name: "Tout" }].concat(
    apiCategories.map(function (category) {
      return {
        id: String(category.id),
        name: category.name,
      };
    })
  );

  products = apiCategories.flatMap(function (category) {
    const categoryProducts = Array.isArray(category.products) ? category.products : [];

    return categoryProducts.map(function (product) {
      const image = normalizeImageUrl(product.image, DEFAULT_PRODUCT_IMAGE);

      return {
        id: product.id,
        categoryId: String(category.id),
        name: product.name,
        meta: getTrimmedDescription(product.description),
        price: formatApiPrice(product.price),
        image: image,
        detailImage: image,
        alt: product.name,
        hasSizes: product.has_sizes === true || product.has_sizes === 1 || product.has_sizes === "1",
        variants: Array.isArray(product.variants) ? product.variants : [],
      };
    });
  });
}

async function loadPublicMenu() {
  const restaurantId = getRestaurantIdFromUrl();
  if (!restaurantId) {
    return;
  }

  const response = await fetch(`${API_BASE_URL}/menu/${restaurantId}`);
  if (!response.ok) {
    throw new Error("Menu public indisponible.");
  }

  const data = await response.json();
  applyRestaurantData(data.restaurant);
  mapPublicMenuData(data);
}

async function initializeMenu() {
  try {
    await loadPublicMenu();
  } catch (error) {
    console.warn("Impossible de charger le menu public :", error.message);
  }

  renderCategories();
  showProducts("all");
}

function createCategoryButton(category) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "category-pill";
  button.dataset.categoryId = String(category.id);
  button.textContent = category.name;

  if (category.id === activeCategory) {
    button.classList.add("active");
  }

  button.addEventListener("click", function () {
    setActiveNav(homeNavEl);
    showProducts(String(category.id));
    button.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  });

  return button;
}

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";
  if (!hasVisibleDescription(product.meta)) {
    card.classList.add("product-card--no-meta");
  }
  const productName = escapeHtml(product.name);
  const productMeta = escapeHtml(product.meta);
  const productPrice = escapeHtml(product.price);
  const productImage = escapeHtml(product.image);
  const productAlt = escapeHtml(product.alt);
  const favorite = isFavorite(product.id);
  const metaBlock = hasVisibleDescription(product.meta)
    ? `<p class="product-card__meta">${productMeta}</p>`
    : "";
  card.innerHTML = `
    <div class="product-card__media">
      <img class="product-card__image" src="${productImage}" alt="${productAlt}" loading="lazy" />
      <button
        class="product-card__heart ${favorite ? "is-favorite" : ""}"
        type="button"
        aria-label="Ajouter ${productName} aux favoris"
        aria-pressed="${favorite}"
      >
        <i class="${getFavoriteIconClass(product.id)} fa-heart" aria-hidden="true"></i>
      </button>
    </div>
    <div class="product-card__body">
      <h3 class="product-card__name">${productName}</h3>
      <p class="product-card__price">${productPrice}</p>
      ${metaBlock}
    </div>
  `;

  card.addEventListener("click", function () {
    showProductDetail(product);
  });

  card.querySelector(".product-card__heart").addEventListener("click", function (event) {
    event.stopPropagation();
    toggleFavorite(product.id, event.currentTarget);
  });

  return card;
}

function createSimilarProductCard(product) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "similar-card";
  const productName = escapeHtml(product.name);
  const productMeta = escapeHtml(product.meta);
  const productPrice = escapeHtml(product.price);
  const productImage = escapeHtml(product.image);
  const productAlt = escapeHtml(product.alt);
  const favorite = isFavorite(product.id);
  const similarMetaBlock = hasVisibleDescription(product.meta)
    ? `<span class="similar-card__meta">${productMeta}</span>`
    : "";
  card.innerHTML = `
    <span
      class="similar-card__heart ${favorite ? "is-favorite" : ""}"
      role="button"
      tabindex="0"
      aria-label="Ajouter ${productName} aux favoris"
      aria-pressed="${favorite}"
    >
      <i class="${getFavoriteIconClass(product.id)} fa-heart" aria-hidden="true"></i>
    </span>
    <img class="similar-card__image" src="${productImage}" alt="${productAlt}" loading="lazy" />
    <span class="similar-card__body">
      <span class="similar-card__name">${productName}</span>
      ${similarMetaBlock}
      <span class="similar-card__price">${productPrice}</span>
    </span>
  `;

  card.addEventListener("click", function () {
    showProductDetail(product);
  });

  card.querySelector(".similar-card__heart").addEventListener("click", function (event) {
    event.stopPropagation();
    toggleFavorite(product.id, event.currentTarget);
  });

  return card;
}

function renderCategories() {
  categoriesEl.innerHTML = "";
  categories.forEach(function (category) {
    categoriesEl.appendChild(createCategoryButton(category));
  });
}

function setActiveCategory(categoryId) {
  activeCategory = categoryId;
  document.querySelectorAll(".category-pill").forEach(function (button) {
    button.classList.toggle("active", button.dataset.categoryId === String(categoryId));
  });
}

function createProductsCategoryTitle(categoryName) {
  const title = document.createElement("h3");
  title.className = "products-category-title";
  title.textContent = categoryName;
  return title;
}

function showProducts(categoryId) {
  setActiveCategory(categoryId);
  productsEl.innerHTML = "";

  if (categoryId === "all") {
    let hasProducts = false;

    categories
      .filter(function (category) {
        return category.id !== "all";
      })
      .forEach(function (category) {
        const categoryProducts = products.filter(function (product) {
          return String(product.categoryId) === String(category.id);
        });

        if (!categoryProducts.length) {
          return;
        }

        hasProducts = true;
        productsEl.appendChild(createProductsCategoryTitle(category.name));
        categoryProducts.forEach(function (product) {
          productsEl.appendChild(createProductCard(product));
        });
      });

    if (!hasProducts) {
      const empty = document.createElement("p");
      empty.className = "menu-empty";
      empty.textContent = "Aucun plat disponible pour le moment.";
      productsEl.appendChild(empty);
    }

    return;
  }

  const visibleProducts = products.filter(function (product) {
    return String(product.categoryId) === String(categoryId);
  });

  if (!visibleProducts.length) {
    const empty = document.createElement("p");
    empty.className = "menu-empty";
    empty.textContent = "Aucun plat disponible dans cette catégorie.";
    productsEl.appendChild(empty);
    return;
  }

  visibleProducts.forEach(function (product) {
    productsEl.appendChild(createProductCard(product));
  });
}

function showFavoriteProducts() {
  activeCategory = "";
  productsEl.innerHTML = "";
  document.querySelectorAll(".category-pill").forEach(function (button) {
    button.classList.remove("active");
  });
  setActiveNav(favoritesNavEl);

  const favoriteProducts = products.filter(function (product) {
    return isFavorite(product.id);
  });

  if (!favoriteProducts.length) {
    const empty = document.createElement("p");
    empty.className = "menu-empty";
    empty.textContent = "Aucun plat favori pour le moment.";
    productsEl.appendChild(empty);
    return;
  }

  favoriteProducts.forEach(function (product) {
    productsEl.appendChild(createProductCard(product));
  });
}

function renderSimilarProducts(currentProduct) {
  similarProductsEl.innerHTML = "";

  var section = similarProductsEl.closest(".similar-section");
  var titleEl = document.getElementById("similar-title");
  var catId =
    currentProduct.categoryId !== undefined && currentProduct.categoryId !== null ?
      String(currentProduct.categoryId)
    : "";

  /** Autres produits de la même catégorie (excluant le plat ouvert). */
  var peers = products.filter(function (product) {
    if (product.id === currentProduct.id) {
      return false;
    }
    return String(product.categoryId) === catId;
  });

  if (!peers.length) {
    if (section) {
      section.hidden = true;
    }
    return;
  }

  if (section) {
    section.hidden = false;
  }
  if (titleEl) {
    titleEl.textContent = peers.length > 1 ? "Dans cette catégorie" : "Autre plat de la même catégorie";
  }

  peers.forEach(function (product) {
    similarProductsEl.appendChild(createSimilarProductCard(product));
  });
}

function formatQuantity(value) {
  return String(value).padStart(2, "0");
}

function parsePrice(price) {
  if (typeof price === "number") {
    return Number.isFinite(price) ? price : 0;
  }
  const numericValue = Number(price);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }
  return Number(String(price || "").replace(/[^\d,.-]/g, "").replace(/\s/g, "").replace(",", ".")) || 0;
}

function formatPrice(value) {
  return `${value.toLocaleString("fr-FR")} CFA`;
}

function normalizeVariant(variant, index, product) {
  const fallbackNames = ["Petit", "Moyen", "Grand"];
  const name = variant && variant.name ? String(variant.name) : fallbackNames[index] || `Option ${index + 1}`;
  const value = variant && variant.price != null ? variant.price : product.price;
  const image =
    variant && variant.image ? normalizeImageUrl(variant.image, product.detailImage || product.image) : product.detailImage || product.image;

  return {
    id: variant && variant.id != null ? String(variant.id) : name.toLowerCase(),
    name: name,
    price: formatPrice(parsePrice(value)),
    image: image,
  };
}

function getProductVariants(product) {
  if (!product || !product.hasSizes) {
    return [];
  }

  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants.map(function (variant, index) {
      return normalizeVariant(variant, index, product);
    });
  }

  return [];
}

function setSelectedVariant(variant) {
  selectedVariant = variant;
  detailPriceEl.textContent = variant ? variant.price : selectedProduct.price;
  detailImageEl.src = selectedProduct.detailImage || selectedProduct.image;
  detailImageEl.alt = variant ? `${selectedProduct.name} - ${variant.name}` : selectedProduct.alt;

  document.querySelectorAll(".size-option").forEach(function (button) {
    button.classList.toggle("active", variant && button.dataset.variantId === variant.id);
  });
}

function renderProductVariants(product) {
  const variants = getProductVariants(product);
  sizeOptionsEl.innerHTML = "";
  detailSizeGroupEl.hidden = !variants.length;

  if (!variants.length) {
    selectedVariant = null;
    detailPriceEl.textContent = product.price;
    return;
  }

  variants.forEach(function (variant, index) {
    const button = document.createElement("button");
    button.className = "size-option";
    button.type = "button";
    button.dataset.variantId = variant.id;
    button.innerHTML = `<span>${escapeHtml(variant.name)}</span><small>${escapeHtml(variant.price)}</small>`;

    button.addEventListener("click", function () {
      setSelectedVariant(variant);
    });

    sizeOptionsEl.appendChild(button);

    if (index === 0) {
      setSelectedVariant(variant);
    }
  });
}

function updateQuantity(value) {
  quantity = Math.max(1, value);
  quantityValueEl.textContent = formatQuantity(quantity);
}

function showProductDetail(product) {
  selectedProduct = product;
  detailImageEl.src = product.detailImage || product.image;
  detailImageEl.alt = product.alt;
  detailTitleEl.textContent = product.name;
  detailPriceEl.textContent = product.price;
  if (hasVisibleDescription(product.meta)) {
    detailDescriptionEl.textContent = getTrimmedDescription(product.meta);
    detailDescriptionEl.removeAttribute("hidden");
  } else {
    detailDescriptionEl.textContent = "";
    detailDescriptionEl.hidden = true;
  }
  renderProductVariants(product);
  updateQuantity(1);
  renderSimilarProducts(product);
  productDetailEl.hidden = false;
  whatsappEl.hidden = true;
  bottomNavEl.hidden = true;
  productDetailEl.scrollTop = 0;
}

function hideProductDetail() {
  productDetailEl.hidden = true;
  whatsappEl.hidden = false;
  bottomNavEl.hidden = false;
}

function showCartToast(productName) {
  window.clearTimeout(toastTimeout);
  cartToastEl.textContent = `${productName} ajouté au panier`;
  cartToastEl.hidden = false;
  toastTimeout = window.setTimeout(function () {
    cartToastEl.hidden = true;
  }, 2200);
}

function getSelectedOrderLine() {
  const variantSuffix = selectedVariant ? ` (${selectedVariant.name})` : "";
  const variantKey = selectedVariant ? selectedVariant.id : "default";
  const price = selectedVariant ? selectedVariant.price : selectedProduct.price;

  return {
    key: `${selectedProduct.id}:${variantKey}`,
    product: selectedProduct,
    label: selectedProduct.name + variantSuffix,
    price: price,
    quantity: quantity,
  };
}

function addSelectedProductToOrder(options) {
  if (!selectedProduct) {
    return;
  }

  const shouldReplaceQuantity = Boolean(options && options.replaceQuantity);
  const line = getSelectedOrderLine();
  const existingItem = orderItems.find(function (item) {
    return item.key === line.key;
  });

  if (existingItem) {
    existingItem.quantity = shouldReplaceQuantity ? quantity : existingItem.quantity + quantity;
  } else {
    orderItems.push(line);
  }
}

function calculateOrderTotal() {
  return orderItems.reduce(function (total, item) {
    return total + parsePrice(item.price) * item.quantity;
  }, 0);
}

function updateOrderItemQuantity(itemKey, nextQuantity) {
  orderItems = orderItems
    .map(function (item) {
      if (item.key !== itemKey) {
        return item;
      }

      return {
        key: item.key,
        product: item.product,
        label: item.label,
        price: item.price,
        quantity: Math.max(0, nextQuantity),
      };
    })
    .filter(function (item) {
      return item.quantity > 0;
    });

  renderOrder();
}

function createOrderItem(item) {
  const row = document.createElement("div");
  row.className = "order-item";
  const itemLabel = escapeHtml(item.label);
  const itemPrice = escapeHtml(item.price);
  row.innerHTML = `
    <span class="order-item__name">${item.quantity} x ${itemLabel}</span>
    <span class="order-item__controls">
      <button class="order-qty-btn" type="button" data-action="plus" aria-label="Ajouter ${itemLabel}">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </button>
      <button class="order-qty-btn" type="button" data-action="minus" aria-label="Retirer ${itemLabel}">
        <i class="fa-solid fa-minus" aria-hidden="true"></i>
      </button>
    </span>
    <span class="order-item__price">${itemPrice}</span>
  `;

  row.querySelector('[data-action="plus"]').addEventListener("click", function () {
    updateOrderItemQuantity(item.key, item.quantity + 1);
  });

  row.querySelector('[data-action="minus"]').addEventListener("click", function () {
    updateOrderItemQuantity(item.key, item.quantity - 1);
  });

  return row;
}

function renderOrder() {
  orderListEl.innerHTML = "";

  if (!orderItems.length) {
    const empty = document.createElement("p");
    empty.className = "order-empty";
    empty.textContent = "Votre commande est vide.";
    orderListEl.appendChild(empty);
  } else {
    orderItems.forEach(function (item) {
      orderListEl.appendChild(createOrderItem(item));
    });
  }

  orderTotalEl.textContent = formatPrice(calculateOrderTotal());
}

function showOrderPage() {
  orderPreviousView = productDetailEl.hidden ? "menu" : "detail";
  productDetailEl.hidden = true;
  orderPageEl.hidden = false;
  whatsappEl.hidden = true;
  bottomNavEl.hidden = false;
  setActiveNav(cartNavEl);
  renderOrder();
}

function hideOrderPage(targetView) {
  orderPageEl.hidden = true;

  if (targetView === "detail") {
    productDetailEl.hidden = false;
    whatsappEl.hidden = true;
    bottomNavEl.hidden = true;
    setActiveNav(homeNavEl);
    return;
  }

  productDetailEl.hidden = true;
  whatsappEl.hidden = false;
  bottomNavEl.hidden = false;
  setActiveNav(homeNavEl);
}

function getWhatsappGreeting() {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? "Bonsoir" : "Bonjour";
}

function createOrderWhatsappMessage() {
  const lines = orderItems.map(function (item) {
    return `- ${item.quantity} x ${item.label} : ${item.price}`;
  });

  return [
    `${getWhatsappGreeting()}, je souhaite commander :`,
    ...lines,
    `Total : ${formatPrice(calculateOrderTotal())}`,
  ].join("\n");
}

function openWhatsapp(productName) {
  const message = productName
    ? `Bonjour, je souhaite commander : ${productName}`
    : "Bonjour, je souhaite passer une commande.";
  const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener");
}

whatsappEl.addEventListener("click", function (event) {
  event.preventDefault();
  showOrderPage();
});

detailBackEl.addEventListener("click", hideProductDetail);

homeNavEl.addEventListener("click", function (event) {
  event.preventDefault();
  orderPageEl.hidden = true;
  productDetailEl.hidden = true;
  whatsappEl.hidden = false;
  bottomNavEl.hidden = false;
  setActiveNav(homeNavEl);
  showProducts("all");
});

quantityMinusEl.addEventListener("click", function () {
  updateQuantity(quantity - 1);
});

quantityPlusEl.addEventListener("click", function () {
  updateQuantity(quantity + 1);
});

detailOrderEl.addEventListener("click", function () {
  addSelectedProductToOrder({ replaceQuantity: true });
  showOrderPage();
});

detailAddEl.addEventListener("click", function () {
  addSelectedProductToOrder();
  showCartToast(selectedProduct.name);
});

orderBackEl.addEventListener("click", function () {
  hideOrderPage(orderPreviousView);
});

cartNavEl.addEventListener("click", function (event) {
  event.preventDefault();
  showOrderPage();
});

favoritesNavEl.addEventListener("click", function (event) {
  event.preventDefault();
  orderPageEl.hidden = true;
  productDetailEl.hidden = true;
  whatsappEl.hidden = false;
  bottomNavEl.hidden = false;
  showFavoriteProducts();
});

orderSubmitEl.addEventListener("click", function () {
  if (!orderItems.length) {
    return;
  }

  const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(createOrderWhatsappMessage())}`;
  window.open(url, "_blank", "noopener");
});

initializeMenu();
