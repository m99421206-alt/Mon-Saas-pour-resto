/**
 * Page Paramètres — Gestion des informations du restaurant (Nom, WhatsApp, Logo, Bannière, Thème).
 */
(function () {
  "use strict";

  var API_URL = window.MenuGo_CONFIG.API_URL;
  var TOKEN_KEY = "MenuGo_token";
  var USER_KEY = "MenuGo_user";
  var RESTAURANT_KEY = "MenuGo_restaurant";

  var form = document.getElementById("parametres-form");
  var feedback = document.getElementById("parametres-feedback");
  var saveBtn = document.getElementById("parametres-save");

  var nameInput = document.getElementById("restaurant-name");
  var descInput = document.getElementById("restaurant-description");
  var whatsappInput = document.getElementById("whatsapp-number");

  var logoFileInput = document.getElementById("logo-file");
  var logoUrlInput = document.getElementById("logo-url");
  var logoPreview = document.getElementById("logo-preview");
  var logoDropzone = document.getElementById("logo-dropzone");

  var bannerFileInput = document.getElementById("banner-file");
  var bannerUrlInput = document.getElementById("banner-url");
  var bannerPreview = document.getElementById("banner-preview");
  var bannerDropzone = document.getElementById("banner-dropzone");

  var themeChoices = document.getElementById("theme-choices");
  var themeColorInput = document.getElementById("theme-color-text");

  var drawerRestaurant = document.getElementById("param-drawer-restaurant");
  var drawerEmail = document.getElementById("param-drawer-email");
  var logoutLink = document.getElementById("param-logout");

  if (!form) return;

  var isSubmitting = false;

  function redirectToLogin() {
    window.location.href = "login.html";
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
  }

  function getStoredJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }

  function setFeedback(message, isError) {
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.hidden = !message;
    feedback.classList.toggle("is-error", Boolean(isError));
    if (isError && message && window.MenuGo_Toast) {
      window.MenuGo_Toast.error(message);
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

    var response = await fetch(API_URL + "/upload", {
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
    var strUrl = String(url);
    if (strUrl.indexOf("/uploads/") === 0 || strUrl.indexOf("uploads/") === 0) {
      var cleanPath = strUrl.startsWith("/") ? strUrl : "/" + strUrl;
      return window.location.origin + cleanPath;
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

  function setPreview(previewEl, dropzoneEl, url) {
    if (!previewEl) return;
    var contentEl = dropzoneEl
      ? dropzoneEl.querySelector(".param-dropzone__content")
      : null;

    if (!url) {
      previewEl.hidden = true;
      previewEl.removeAttribute("src");
      if (dropzoneEl) dropzoneEl.classList.remove("has-preview");
      if (contentEl) contentEl.hidden = false;
      return;
    }

    previewEl.src = resolveImageUrl(url);
    previewEl.hidden = false;
    if (dropzoneEl) dropzoneEl.classList.add("has-preview");
    if (contentEl) contentEl.hidden = true;
  }

  function setupDropzone(dropzoneEl, fileInputEl, previewEl, hiddenUrlInput) {
    if (!dropzoneEl || !fileInputEl) return;

    dropzoneEl.addEventListener("click", function (e) {
      if (e.target === fileInputEl) return;
      fileInputEl.click();
    });

    dropzoneEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInputEl.click();
      }
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
      dropzoneEl.addEventListener(eventName, function (e) {
        e.preventDefault();
        dropzoneEl.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
      dropzoneEl.addEventListener(eventName, function (e) {
        e.preventDefault();
        dropzoneEl.classList.remove("is-dragover");
      });
    });

    dropzoneEl.addEventListener("drop", function (e) {
      var file =
        e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
      if (!file || !isAllowedImageFile(file)) {
        if (file) setFeedback(UPLOAD_REJECT_MESSAGE, true);
        return;
      }
      var transfer = new DataTransfer();
      transfer.items.add(file);
      fileInputEl.files = transfer.files;
      setFeedback("");
      setPreview(previewEl, dropzoneEl, URL.createObjectURL(file));
    });

    fileInputEl.addEventListener("change", function () {
      var file = fileInputEl.files ? fileInputEl.files[0] : null;
      if (file) {
        if (!isAllowedImageFile(file)) {
          fileInputEl.value = "";
          setPreview(
            previewEl,
            dropzoneEl,
            hiddenUrlInput ? hiddenUrlInput.value : "",
          );
          setFeedback(UPLOAD_REJECT_MESSAGE, true);
          return;
        }
        setFeedback("");
        setPreview(previewEl, dropzoneEl, URL.createObjectURL(file));
      } else {
        setPreview(
          previewEl,
          dropzoneEl,
          hiddenUrlInput ? hiddenUrlInput.value : "",
        );
      }
    });
  }

  function setSelectedThemeColor(color) {
    var hexColor = String(color || "#FF7A00").toUpperCase();
    if (themeColorInput) themeColorInput.value = hexColor;

    if (!themeChoices) return;
    var buttons = themeChoices.querySelectorAll(".param-theme-choice");
    buttons.forEach(function (btn) {
      var btnColor = (btn.getAttribute("data-theme-color") || "").toUpperCase();
      var isMatch = btnColor === hexColor;
      btn.setAttribute("aria-checked", isMatch ? "true" : "false");
      btn.classList.toggle("is-active", isMatch);
    });
  }

  function initThemeSelector() {
    if (!themeChoices) return;
    var buttons = themeChoices.querySelectorAll(".param-theme-choice");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var chosenColor = btn.getAttribute("data-theme-color");
        if (chosenColor) {
          setSelectedThemeColor(chosenColor);
        }
      });
    });
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

  function fillForm(restaurant) {
    if (!restaurant) return;
    if (nameInput) nameInput.value = restaurant.name || "";
    if (descInput) descInput.value = restaurant.description || "";
    if (whatsappInput) whatsappInput.value = restaurant.whatsapp || "";

    if (logoUrlInput) logoUrlInput.value = restaurant.logo_url || "";
    setPreview(logoPreview, logoDropzone, restaurant.logo_url || "");

    if (bannerUrlInput) bannerUrlInput.value = restaurant.banner_url || "";
    setPreview(bannerPreview, bannerDropzone, restaurant.banner_url || "");

    setSelectedThemeColor(restaurant.theme_color || "#FF7A00");
  }

  async function loadSettings() {
    try {
      setFeedback("Chargement des paramètres...");

      var storedUser = getStoredJson(USER_KEY);
      var storedRestaurant = getStoredJson(RESTAURANT_KEY);
      renderAccountInfo(storedUser, storedRestaurant);
      if (storedRestaurant) fillForm(storedRestaurant);

      var me = await apiRequest("/me");
      if (me && me.restaurant) {
        localStorage.setItem(USER_KEY, JSON.stringify(me.user));
        localStorage.setItem(RESTAURANT_KEY, JSON.stringify(me.restaurant));
        renderAccountInfo(me.user, me.restaurant);
        fillForm(me.restaurant);
      }
      setFeedback("");
    } catch (e) {
      setFeedback(e.message || "Erreur de chargement.", true);
    }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (isSubmitting) return;

    var name = nameInput ? nameInput.value.trim() : "";
    if (!name) {
      setFeedback("Le nom du restaurant est obligatoire.", true);
      if (nameInput) nameInput.focus();
      return;
    }

    isSubmitting = true;
    if (saveBtn) saveBtn.disabled = true;
    setFeedback("Enregistrement en cours...");

    try {
      var logoUrl = logoUrlInput ? logoUrlInput.value.trim() : "";
      var bannerUrl = bannerUrlInput ? bannerUrlInput.value.trim() : "";

      if (logoFileInput && logoFileInput.files && logoFileInput.files[0]) {
        setFeedback("Téléversement du logo...");
        logoUrl = await uploadImage(logoFileInput.files[0]);
      }

      if (
        bannerFileInput &&
        bannerFileInput.files &&
        bannerFileInput.files[0]
      ) {
        setFeedback("Téléversement de la bannière...");
        bannerUrl = await uploadImage(bannerFileInput.files[0]);
      }

      var payload = {
        name: name,
        description: descInput ? descInput.value.trim() : "",
        whatsapp: whatsappInput ? whatsappInput.value.trim() : "",
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        theme_color: themeColorInput ? themeColorInput.value : "#FF7A00",
      };

      setFeedback("Mise à jour du restaurant...");
      var updatedResto = await apiRequest("/restaurant", {
        method: "PUT",
        body: payload,
      });

      var savedRestaurant =
        updatedResto && updatedResto.restaurant
          ? updatedResto.restaurant
          : updatedResto;

      if (savedRestaurant) {
        localStorage.setItem(RESTAURANT_KEY, JSON.stringify(savedRestaurant));
        fillForm(savedRestaurant);
        var currentUser = getStoredJson(USER_KEY);
        renderAccountInfo(currentUser, savedRestaurant);
      }

      if (logoFileInput) logoFileInput.value = "";
      if (bannerFileInput) bannerFileInput.value = "";

      if (window.MenuGo_Toast) {
        window.MenuGo_Toast.success("Paramètres enregistrés avec succès.");
      }
      setFeedback("");
    } catch (err) {
      setFeedback(
        err.message || "Impossible d'enregistrer les paramètres.",
        true,
      );
    } finally {
      isSubmitting = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  if (logoutLink) {
    logoutLink.addEventListener("click", clearSession);
  }

  setupDropzone(logoDropzone, logoFileInput, logoPreview, logoUrlInput);
  setupDropzone(bannerDropzone, bannerFileInput, bannerPreview, bannerUrlInput);
  initThemeSelector();
  loadSettings();
})();
