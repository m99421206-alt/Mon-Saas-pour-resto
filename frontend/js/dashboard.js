/**
 * Dashboard AfricaMenu
 * - Drawer : ouverture / fermeture, overlay, Escape, aria-expanded
 * - Données : profil, restaurant, catégories et produits depuis l’API.
 */
(function () {
  "use strict";

  const API_URL = "http://localhost:4000";
  const TOKEN_KEY = "africamenu_token";
  const USER_KEY = "africamenu_user";
  const RESTAURANT_KEY = "africamenu_restaurant";

  const openBtn = document.getElementById("open-drawer");
  const closeBtn = document.getElementById("close-drawer");
  const drawer = document.getElementById("dash-drawer");
  const overlay = document.getElementById("dash-overlay");
  const title = document.getElementById("dashboard-title");
  const categoriesCount = document.getElementById("dashboard-categories-count");
  const productsCount = document.getElementById("dashboard-products-count");
  const drawerRestaurant = document.getElementById("dashboard-drawer-restaurant");
  const drawerEmail = document.getElementById("dashboard-drawer-email");
  const menuUrlInput = document.getElementById("dashboard-menu-url");
  const viewMenuBtn = document.getElementById("dashboard-view-menu");
  const logoutLink = document.getElementById("dashboard-logout");
  const addProductBtn = document.getElementById("dashboard-add-product");
  const addCategoryBtn = document.getElementById("dashboard-add-category");

  const TRANSITION_MS = 320;
  let closeTimer = null;

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  async function apiGet(path) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    const response = await fetch(API_URL + path, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await readJson(response);
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

  function getStoredRestaurant() {
    try {
      return JSON.parse(localStorage.getItem(RESTAURANT_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function buildPublicMenuUrl(restaurantId) {
    const currentPath = window.location.pathname;
    const menuPath = currentPath.replace(/dashboard\.html$/, "mon-menu.html");
    return window.location.origin + menuPath + "?id=" + encodeURIComponent(restaurantId);
  }

  function renderDashboard(me, categories, products) {
    const restaurant = me.restaurant || getStoredRestaurant();
    const user = me.user || {};
    const restaurantName = restaurant && restaurant.name ? restaurant.name : "votre restaurant";

    title.textContent = "Bonjour, " + restaurantName;
    drawerRestaurant.textContent = restaurantName;
    drawerEmail.textContent = user.email || "email du resto";
    categoriesCount.textContent = String(categories.length);
    productsCount.textContent = String(products.length);

    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
    localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant || null));

    if (restaurant && restaurant.id) {
      const publicUrl = buildPublicMenuUrl(restaurant.id);
      document.body.setAttribute("data-menu-id", String(restaurant.id));
      menuUrlInput.value = publicUrl;
      viewMenuBtn.setAttribute("data-menu-url", publicUrl);
    }
  }

  async function loadDashboard() {
    if (!title || !categoriesCount || !productsCount || !menuUrlInput || !viewMenuBtn) {
      return;
    }

    try {
      const [me, categoriesData, productsData] = await Promise.all([
        apiGet("/api/me"),
        apiGet("/api/categories"),
        apiGet("/api/products"),
      ]);

      if (!me || !categoriesData || !productsData) {
        return;
      }

      renderDashboard(me, categoriesData.categories || [], productsData.products || []);
    } catch (error) {
      title.textContent = "Impossible de charger le dashboard";
    }
  }

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

  logoutLink?.addEventListener("click", function () {
    clearSession();
  });

  addProductBtn?.addEventListener("click", function () {
    window.location.href = "mes-plats.html";
  });

  addCategoryBtn?.addEventListener("click", function () {
    window.location.href = "categories.html";
  });

  viewMenuBtn?.addEventListener("click", function () {
    const explicitUrl = viewMenuBtn.getAttribute("data-menu-url");
    if (explicitUrl) {
      window.location.href = explicitUrl;
    }
  });

  loadDashboard();
})();
