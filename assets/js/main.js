/**
 * AfricaMenu — scripts landing
 * - Révélation progressive des blocs au scroll (accessibilité : respecte prefers-reduced-motion côté CSS)
 * - Lissage du comportement des ancres internes
 * - Journalisation discrète des clics CTA (placeholder jusqu’à branchement backend)
 */

(function () {
  "use strict";

  /** Numéro WhatsApp équipe AfricaMenu pour les demandes depuis la landing (chiffres, indicatif inclus, sans espaces obligatoires) */
  const LANDING_SUPPORT_WHATSAPP =
    typeof window.AFRICA_LANDING_WHATSAPP === "string" && window.AFRICA_LANDING_WHATSAPP.trim()
      ? window.AFRICA_LANDING_WHATSAPP.trim()
      : "22399421206";
  const REVEAL_SELECTOR = "[data-reveal], [data-reveal-group], .reveal";
  const LANDING_FALLBACK_MS = 1600;
  let landingFallbackTimer = 0;

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function isMobileViewport() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 47.9375rem)").matches
    );
  }

  function isLocalDevHost() {
    const host = (window.location.hostname || "").toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      host.indexOf("192.168.") === 0
    );
  }

  /**
   * Google Analytics — chargé après le rendu (évite le blocage du thread principal).
   */
  function initAnalyticsDeferred() {
    if (window.__AFRICA_ANALYTICS_LOADED || isLocalDevHost()) return;

    window.__AFRICA_ANALYTICS_LOADED = true;
    window.dataLayer = window.dataLayer || [];

    function gtag() {
      window.dataLayer.push(arguments);
    }

    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", "G-N40SHP116G");

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-N40SHP116G";
    document.head.appendChild(script);
  }

  function scheduleAnalyticsDeferred() {
    const run = () => initAnalyticsDeferred();

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 4000 });
      return;
    }

    window.addEventListener("load", () => {
      window.setTimeout(run, 1500);
    });
  }

  /**
   * Affiche header + hero (+ sections visibles) — filet de sécurité si l’anim ne part pas.
   */
  function forceLandingVisible(revealAll) {
    document.body.classList.add("landing-ready");
    const hero = document.querySelector(".reveal-hero");
    if (hero) hero.classList.add("is-ready");

    if (revealAll) {
      document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
        el.classList.add("is-visible");
      });
    }
  }

  function clearLandingFallback() {
    if (!landingFallbackTimer) return;
    window.clearTimeout(landingFallbackTimer);
    landingFallbackTimer = 0;
  }

  function scheduleLandingFallback() {
    clearLandingFallback();
    landingFallbackTimer = window.setTimeout(() => {
      forceLandingVisible(true);
    }, LANDING_FALLBACK_MS);
  }

  /**
   * Hero/header visibles dès le HTML — on ne retarde plus le LCP pour une animation.
   */
  function initLandingEntrance() {
    document.body.classList.add("landing-ready");
    const hero = document.querySelector(".reveal-hero");
    if (hero) hero.classList.add("is-ready");
    clearLandingFallback();
    if (prefersReducedMotion()) {
      forceLandingVisible(true);
    }
  }

  /** Modal installation : scripts chargés à la demande (hors chemin critique). */
  function loadInstallModalScripts() {
    if (window.__AFRICA_INSTALL_MODAL_LOADED) {
      return Promise.resolve();
    }

    window.__AFRICA_INSTALL_MODAL_LOADED = true;

    return new Promise((resolve, reject) => {
      const configScript = document.createElement("script");
      configScript.src = "/frontend/js/config.js";
      configScript.defer = true;
      configScript.onload = () => {
        const installScript = document.createElement("script");
        installScript.src = "/assets/js/landing-install-request.js";
        installScript.defer = true;
        installScript.onload = () => resolve();
        installScript.onerror = reject;
        document.body.appendChild(installScript);
      };
      configScript.onerror = reject;
      document.body.appendChild(configScript);
    });
  }

  function initInstallModalLazyLoad() {
    let loading = null;

    const ensureLoaded = () => {
      if (!loading) loading = loadInstallModalScripts();
      return loading;
    };

    const openWhenReady = (trigger) => {
      ensureLoaded()
        .then(() => {
          if (typeof window.AFRICA_openInstallModal === "function") {
            window.AFRICA_openInstallModal(trigger);
            return;
          }
          throw new Error("install_modal_unavailable");
        })
        .catch(() => {
          window.alert(
            "Impossible d'ouvrir le formulaire pour le moment. Vérifiez votre connexion et réessayez."
          );
        });
    };

    const prefetchInstallModal = (event) => {
      if (!event.target.closest("[data-open-install-modal]")) return;
      ensureLoaded().catch(() => {});
    };

    // Mobile : charger les scripts dès le toucher (avant le clic ~300 ms plus tard).
    document.addEventListener("pointerdown", prefetchInstallModal, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchstart", prefetchInstallModal, {
      capture: true,
      passive: true,
    });

    document.addEventListener(
      "click",
      (event) => {
        const trigger = event.target.closest("[data-open-install-modal]");
        if (!trigger || window.__AFRICA_INSTALL_MODAL_READY) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        openWhenReady(trigger);
      },
      true
    );

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => ensureLoaded().catch(() => {}), {
        timeout: 3000,
      });
    } else {
      window.addEventListener("load", () => {
        window.setTimeout(() => ensureLoaded().catch(() => {}), 1500);
      });
    }
  }

  /**
   * Ombre légère du header sticky au scroll.
   */
  function initHeaderScrollState() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    const sync = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 6);
    };

    sync();
    window.addEventListener("scroll", sync, { passive: true });
  }

  /**
   * IntersectionObserver — fade-up au scroll (data-reveal + data-reveal-group).
   */
  function initScrollReveal() {
    const nodes = document.querySelectorAll(REVEAL_SELECTOR);
    if (!nodes.length) return;

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      nodes.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const mobile = isMobileViewport();
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      mobile
        ? { root: null, rootMargin: "0px 0px 10% 0px", threshold: 0.04 }
        : { root: null, rootMargin: "0px 0px -7% 0px", threshold: 0.14 }
    );

    nodes.forEach((el) => observer.observe(el));

    /* Filet de sécurité : révéler les blocs visibles restés masqués */
    let revealFallbackTimer = 0;

    const revealVisiblePending = () => {
      nodes.forEach((el) => {
        if (el.classList.contains("is-visible")) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      });
    };

    const scheduleRevealFallback = () => {
      window.clearTimeout(revealFallbackTimer);
      revealFallbackTimer = window.setTimeout(revealVisiblePending, 180);
    };

    window.addEventListener("scroll", scheduleRevealFallback, { passive: true });
    window.addEventListener("resize", scheduleRevealFallback, { passive: true });
    window.setTimeout(revealVisiblePending, 800);
  }

  /**
   * Ancres internes : scroll fiable + focus accessibilité.
   * #top : scroll explicite (le navigateur ignore souvent un 2e clic sur le même hash).
   */
  function initInternalAnchors() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      if (link.hasAttribute("data-open-install-modal")) return;

      const id = link.getAttribute("href");
      if (!id || id === "#") return;

      if (id === "#top") {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (window.history.replaceState) {
          window.history.replaceState(null, "", id);
        } else {
          window.location.hash = "top";
        }
        const topEl = document.getElementById("top");
        if (topEl) {
          window.requestAnimationFrame(() => {
            if (topEl.tabIndex < 0) topEl.setAttribute("tabindex", "-1");
            topEl.focus({ preventScroll: true });
          });
        }
        return;
      }

      const target = document.querySelector(id);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.requestAnimationFrame(() => {
        if (target.tabIndex < 0) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
    });
  }

  /**
   * Hook CTA : branchez ici analytics, routing SPA, ou ouverture modale.
   * (Volontairement vide pour ne pas polluer la console.)
   */
  function initCtaHooks() {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".btn");
      if (!btn) return;
      // Exemple : window.gtag?.('event', 'cta_click', { label: btn.textContent.trim() });
    });
  }

  function initFooterYear() {
    const el = document.getElementById("footer-year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function initLandingWhatsAppLinks() {
    const digits = String(LANDING_SUPPORT_WHATSAPP || "").replace(/\D/g, "");
    if (!digits.length) return;

    document.querySelectorAll("a[data-wa-message]").forEach((link) => {
      const raw = link.getAttribute("data-wa-message") || "";
      const text = raw.trim();
      const encoded = encodeURIComponent(
        text || "Bonjour, je souhaite des informations sur AfricaMenu pour mon restaurant."
      );
      link.href = `https://wa.me/${digits}?text=${encoded}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  /** Formulaire contact : compose un message WhatsApp (pas de backend requis). */
  function whatsappComposeUrl(bodyText) {
    const digits = String(LANDING_SUPPORT_WHATSAPP || "").replace(/\D/g, "");
    if (!digits.length) return null;
    return (
      "https://wa.me/" + digits + "?text=" + encodeURIComponent(String(bodyText || "").trim())
    );
  }

  function initContactForm() {
    const form = document.getElementById("contact-form");
    const msgEl = document.getElementById("contact-message");
    const feedback = document.getElementById("contact-form-feedback");

    function showFeedback(message, isError) {
      if (!feedback) return;
      feedback.textContent = message || "";
      feedback.hidden = false;
      feedback.classList.toggle("contact-form__feedback--error", Boolean(isError));
    }

    if (!form || !msgEl) return;

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      var nameEl = document.getElementById("contact-name");
      var phoneEl = document.getElementById("contact-phone");
      var name = nameEl && nameEl.value ? String(nameEl.value).trim() : "";
      var phone = phoneEl && phoneEl.value ? String(phoneEl.value).trim() : "";
      var msg = String(msgEl.value || "").trim();
      if (!msg) {
        showFeedback("Merci de rédiger un message.", true);
        msgEl.focus();
        return;
      }
      var body = "Bonjour AfricaMenu,\n\n";
      if (name) body += "Nom : " + name + "\n";
      if (phone) body += "Téléphone : " + phone + "\n";
      body += "\nMessage :\n" + msg;
      var url = whatsappComposeUrl(body);
      if (!url) {
        showFeedback("Numéro support non configuré.", true);
        return;
      }
      showFeedback("Ouverture de WhatsApp…", false);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(function () {
        if (feedback) feedback.hidden = true;
      }, 2600);
    });
  }

  /** Menu burger (mobile) : tiroir + overlay */
  function initSiteHeaderMenu() {
    const header = document.querySelector(".site-header");
    const btn = document.getElementById("site-header-menu-btn");
    const backdrop = document.getElementById("site-header-backdrop");
    const nav = document.getElementById("primary-nav");
    if (!header || !btn || !backdrop || !nav) return;

    const mq = window.matchMedia("(max-width: 47.9375rem)");

    function mqAddListener(mql, handler) {
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", handler);
      } else if (typeof mql.addListener === "function") {
        mql.addListener(handler);
      }
    }

    function isMobileNav() {
      return mq.matches;
    }

    /**
     * Tiroir fermé : évite le tab clavier hors-écran (visibility le complète).
     * Le backdrop est décoratif ; on le garde masqué pour les AT.
     */
    function syncDrawerA11y() {
      if (!isMobileNav()) {
        nav.removeAttribute("aria-hidden");
        backdrop.setAttribute("aria-hidden", "true");
        return;
      }
      const open = nav.classList.contains("is-open");
      nav.setAttribute("aria-hidden", open ? "false" : "true");
      backdrop.setAttribute("aria-hidden", "true");
    }

    function openMenu() {
      if (!isMobileNav()) return;
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Fermer le menu");
      nav.classList.add("is-open");
      document.body.classList.add("site-header--nav-open");
      syncDrawerA11y();
    }

    function closeMenu() {
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Ouvrir le menu");
      nav.classList.remove("is-open");
      document.body.classList.remove("site-header--nav-open");
      syncDrawerA11y();
    }

    function toggleMenu() {
      if (btn.getAttribute("aria-expanded") === "true") closeMenu();
      else openMenu();
    }

    syncDrawerA11y();

    btn.addEventListener("click", () => {
      toggleMenu();
    });

    backdrop.addEventListener("click", () => {
      closeMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (btn.getAttribute("aria-expanded") !== "true") return;
      closeMenu();
      btn.focus();
    });

    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) closeMenu();
    });

    window.addEventListener(
      "resize",
      () => {
        if (!isMobileNav()) closeMenu();
        syncDrawerA11y();
      },
      { passive: true }
    );

    mqAddListener(mq, () => {
      if (!isMobileNav()) closeMenu();
      syncDrawerA11y();
    });
  }

  function bootLanding() {
    document.documentElement.classList.add("js-landing");
    initLandingEntrance();
    initHeaderScrollState();
    initLandingWhatsAppLinks();
    initContactForm();
    initSiteHeaderMenu();
    initInternalAnchors();
    initCtaHooks();
    initFooterYear();
    initInstallModalLazyLoad();
    scheduleAnalyticsDeferred();

    const runScrollReveal = () => initScrollReveal();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runScrollReveal, { timeout: 2200 });
    } else {
      window.setTimeout(runScrollReveal, 300);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootLanding);
  } else {
    bootLanding();
  }
})();
