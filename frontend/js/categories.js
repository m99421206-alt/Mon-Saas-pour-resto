/**
 * Page Catégories — CRUD connecté à l'API.
 */
(function () {
  "use strict";

  const API_URL = window.MenuGo_CONFIG.API_URL;
  const TOKEN_KEY = "MenuGo_token";
  const USER_KEY = "MenuGo_user";
  const RESTAURANT_KEY = "MenuGo_restaurant";

  const form = document.getElementById("cats-form");
  const nameInput = document.getElementById("cats-name");
  const submitBtn = document.getElementById("cats-submit");
  const cancelBtn = document.getElementById("cats-cancel");
  const list = document.getElementById("cats-list");
  const empty = document.getElementById("cats-empty");
  const status = document.getElementById("cats-status");
  const drawerRestaurant = document.getElementById("cats-drawer-restaurant");
  const drawerEmail = document.getElementById("cats-drawer-email");
  const logoutLink = document.getElementById("cats-logout");

  let categories = [];
  let editingId = null;
  let menuEditLocked = false;

  var EDIT_LOCK_MESSAGE =
    "Votre abonnement a expiré. La modification des catégories est désactivée — votre menu public reste visible. Ouvrez « Mon abonnement » pour le réactiver.";

  function applyEditLock(subscription) {
    menuEditLocked =
      !!subscription &&
      Object.prototype.hasOwnProperty.call(subscription, "can_edit_menu") &&
      subscription.can_edit_menu === false;

    document.querySelectorAll("[data-action='add-category']").forEach(function (btn) {
      btn.disabled = menuEditLocked;
      btn.setAttribute("aria-disabled", menuEditLocked ? "true" : "false");
      btn.title = menuEditLocked ? EDIT_LOCK_MESSAGE : "";
    });

    if (menuEditLocked && !form.hidden) {
      closeForm();
    }
  }

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  function setStatus(message, isError, options) {
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
    if (options && options.toast && message && window.MenuGo_Toast) {
      if (isError) window.MenuGo_Toast.error(message);
      else window.MenuGo_Toast.success(message);
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

    if (window.MenuGo_DashShell) {
      window.MenuGo_DashShell.populateProfile(user, restaurant);
    }

    if (me) {
      localStorage.setItem(USER_KEY, JSON.stringify(user || null));
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant || null));
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderCategories() {
    list.innerHTML = "";

    if (!categories.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.hidden = false;

    categories.forEach(function (category) {
      const article = document.createElement("article");
      article.className = "cats-item";
      article.innerHTML =
        '<div class="cats-item__copy"><p class="cats-item__name">' +
        escapeHtml(category.name) +
        '</p></div><div class="cats-item__actions">' +
        '<button type="button" class="cats-item__btn" data-action="edit-category" data-id="' +
        category.id +
        '">Modifier</button>' +
        '<button type="button" class="cats-item__btn cats-item__btn--danger" data-action="delete-category" data-id="' +
        category.id +
        '">Supprimer</button>' +
        "</div>";
      list.appendChild(article);
    });
  }

  function openForm(category) {
    editingId = category ? category.id : null;
    form.hidden = false;
    nameInput.value = category ? category.name : "";
    submitBtn.textContent = category ? "Modifier" : "Enregistrer";
    nameInput.focus();
  }

  function closeForm() {
    editingId = null;
    form.hidden = true;
    form.reset();
  }

  function onAddCategory() {
    if (menuEditLocked) {
      setStatus(EDIT_LOCK_MESSAGE, true, { toast: true });
      return;
    }
    setStatus("");
    openForm(null);
  }

  async function loadPage() {
    try {
      setStatus("Chargement des catégories...");
      renderAccountInfo(null);

      const [me, categoriesData] = await Promise.all([
        apiRequest("/api/me"),
        apiRequest("/api/categories"),
      ]);

      if (!categoriesData) return;

      renderAccountInfo(me);
      categories = categoriesData.categories || [];
      renderCategories();
      applyEditLock(me && me.subscription);
      if (menuEditLocked) {
        setStatus(EDIT_LOCK_MESSAGE, true, { toast: true });
      } else {
        setStatus(categories.length ? "" : "Aucune catégorie pour le moment.");
      }
    } catch (error) {
      setStatus(error.message || "Impossible de charger les catégories.", true, { toast: true });
    }
  }

  document.querySelectorAll("[data-action='add-category']").forEach(function (el) {
    el.addEventListener("click", onAddCategory);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      setStatus("Le nom de la catégorie est requis.", true, { toast: true });
      nameInput.focus();
      return;
    }

    submitBtn.disabled = true;
    const wasEditing = Boolean(editingId);
    setStatus(editingId ? "Modification en cours..." : "Création en cours...");

    try {
      if (editingId) {
        await apiRequest("/api/categories/" + encodeURIComponent(editingId), {
          method: "PUT",
          body: { name: name },
        });
      } else {
        await apiRequest("/api/categories", {
          method: "POST",
          body: { name: name },
        });
      }

      closeForm();
      await loadPage();
      setStatus(wasEditing ? "Catégorie modifiée." : "Catégorie ajoutée.", false, { toast: true });
    } catch (error) {
      setStatus(error.message || "Enregistrement impossible.", true, { toast: true });
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", function () {
    closeForm();
    setStatus("");
  });

  list.addEventListener("click", async function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const id = Number(target.getAttribute("data-id"));
    const category = categories.find(function (item) {
      return item.id === id;
    });
    if (!category) return;

    if (menuEditLocked) {
      setStatus(EDIT_LOCK_MESSAGE, true, { toast: true });
      return;
    }

    if (target.getAttribute("data-action") === "edit-category") {
      setStatus("");
      openForm(category);
      return;
    }

    if (target.getAttribute("data-action") === "delete-category") {
      const ok = window.confirm("Supprimer la catégorie \"" + category.name + "\" ?");
      if (!ok) return;

      try {
        setStatus("Suppression en cours...");
        await apiRequest("/api/categories/" + encodeURIComponent(id), {
          method: "DELETE",
        });
        await loadPage();
        setStatus("Catégorie supprimée.", false, { toast: true });
      } catch (error) {
        setStatus(error.message || "Suppression impossible.", true, { toast: true });
      }
    }
  });

  logoutLink?.addEventListener("click", function () {
    clearSession();
  });

  loadPage();
})();
