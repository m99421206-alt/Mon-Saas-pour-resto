/**
 * Connexion — appel API puis stockage du JWT.
 */
(() => {
  "use strict";

  const API_URL = window.MenuGo_CONFIG?.API_URL || "/api";
  const TOKEN_KEY = "MenuGo_token";
  const USER_KEY = "MenuGo_user";
  const RESTAURANT_KEY = "MenuGo_restaurant";

  const form = document.getElementById("form-login");
  const err = document.getElementById("login-error");
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const submitBtn = form?.querySelector('button[type="submit"]');

  if (!form || !err || !emailInput || !passwordInput || !submitBtn) {
    return;
  }

  const showError = (msg) => {
    err.textContent = msg;
    err.classList.add("is-visible");
  };

  const clearError = () => {
    err.textContent = "";
    err.classList.remove("is-visible");
  };

  const readJson = async (response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const saveSession = (data) => {
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
      localStorage.setItem(
        RESTAURANT_KEY,
        JSON.stringify(data.restaurant || null),
      );
    } catch (e) {
      console.warn("Storage inaccessible", e);
    }
  };

  const wantsOnboarding = (data) => {
    if (!data || data.is_platform_admin) {
      return false;
    }
    return data.restaurant?.onboarding_seen === false;
  };

  const isSafeNextPage = (url) => {
    if (!url || typeof url !== "string") return false;
    if (url.includes("/") || url.includes("\\") || url.includes(".."))
      return false;
    if (/^https?:/i.test(url) || url.startsWith("//")) return false;
    return /^[a-zA-Z0-9_-]+\.html$/.test(url);
  };

  const isAdminNextPage = (url) => {
    return typeof url === "string" && /^admin-[\w.-]+\.html$/i.test(url);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) {
      showError("Renseignez votre email et votre mot de passe.");
      return;
    }

    if (
      window.MenuGo_EmailValidate &&
      !window.MenuGo_EmailValidate.isValidEmail(email)
    ) {
      showError(window.MenuGo_EmailValidate.emailFormatMessage());
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Connexion...";

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        showError(data.message || "Email ou mot de passe incorrect.");
        return;
      }

      saveSession(data);

      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");

      if (
        wantsOnboarding(data) &&
        !(isSafeNextPage(next) && isAdminNextPage(next))
      ) {
        window.location.href = "onboarding.html";
      } else if (isSafeNextPage(next)) {
        window.location.href = next;
      } else if (data.is_platform_admin) {
        window.location.href = "admin-dashboard.html";
      } else {
        window.location.href = "dashboard.html";
      }
    } catch {
      showError(
        "Impossible de contacter le serveur. Vérifiez votre connexion internet.",
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Se connecter";
    }
  });
})();
