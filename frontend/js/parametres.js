/**
 * Page Paramètres — chargement et sauvegarde du restaurant.
 */
(function () {
  "use strict";

  var API_URL = "http://localhost:4000";
  var TOKEN_KEY = "africamenu_token";
  var USER_KEY = "africamenu_user";
  var RESTAURANT_KEY = "africamenu_restaurant";

  var form = document.getElementById("parametres-form");
  var feedback = document.getElementById("parametres-feedback");
  var saveBtn = document.getElementById("parametres-save");
  var nameInput = document.getElementById("restaurant-name");
  var descriptionInput = document.getElementById("restaurant-description");
  var whatsappInput = document.getElementById("whatsapp-number");
  var logoInput = document.getElementById("logo-url");
  var drawerRestaurant = document.getElementById("param-drawer-restaurant");
  var drawerEmail = document.getElementById("param-drawer-email");
  var logoutLink = document.getElementById("param-logout");

  if (!form) return;

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  function setFeedback(message, isError) {
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.hidden = !message;
    feedback.classList.toggle("is-error", Boolean(isError));
  }

  function getStoredJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (error) {
      return null;
    }
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  async function apiRequest(path, options) {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      return null;
    }

    var response = await fetch(API_URL + path, {
      method: (options && options.method) || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });

    var data = await readJson(response);
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

  function renderAccountInfo(user, restaurant) {
    var restaurantName = restaurant && restaurant.name ? restaurant.name : "Nom du resto";
    if (drawerRestaurant) drawerRestaurant.textContent = restaurantName;
    if (drawerEmail) drawerEmail.textContent = user && user.email ? user.email : "email du resto";
  }

  function fillForm(restaurant) {
    if (!restaurant) return;
    nameInput.value = restaurant.name || "";
    descriptionInput.value = restaurant.description || "";
    whatsappInput.value = restaurant.whatsapp || "";
    logoInput.value = restaurant.logo_url || "";
  }

  async function loadPage() {
    try {
      setFeedback("Chargement des paramètres...");
      var storedUser = getStoredJson(USER_KEY);
      var storedRestaurant = getStoredJson(RESTAURANT_KEY);
      renderAccountInfo(storedUser, storedRestaurant);
      fillForm(storedRestaurant);

      var me = await apiRequest("/api/me");
      var restaurantData = await apiRequest("/api/restaurant");
      if (!me || !restaurantData) return;

      var restaurant = restaurantData.restaurant || me.restaurant;
      localStorage.setItem(USER_KEY, JSON.stringify(me.user || null));
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant || null));
      renderAccountInfo(me.user, restaurant);
      fillForm(restaurant);
      setFeedback("");
    } catch (error) {
      setFeedback(error.message || "Impossible de charger les paramètres.", true);
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var name = nameInput.value.trim();
    if (!name) {
      setFeedback("Le nom du restaurant est requis.", true);
      nameInput.focus();
      return;
    }

    saveBtn.disabled = true;
    setFeedback("Enregistrement...");

    try {
      var data = await apiRequest("/api/restaurant", {
        method: "PUT",
        body: {
          name: name,
          description: descriptionInput.value.trim() || null,
          whatsapp: whatsappInput.value.trim() || null,
          logo_url: logoInput.value.trim() || null,
        },
      });

      if (!data) return;

      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(data.restaurant || null));
      renderAccountInfo(getStoredJson(USER_KEY), data.restaurant);
      fillForm(data.restaurant);
      setFeedback("Paramètres enregistrés.");
    } catch (error) {
      setFeedback(error.message || "Enregistrement impossible.", true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  if (logoutLink) {
    logoutLink.addEventListener("click", clearSession);
  }

  loadPage();
})();
