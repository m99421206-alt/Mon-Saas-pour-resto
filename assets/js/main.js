/**
 * MenuGo — scripts landing
 * - Révélation progressive des blocs au scroll (accessibilité : respecte prefers-reduced-motion côté CSS)
 * - Lissage du comportement des ancres internes
 * - Journalisation discrète des clics CTA (placeholder jusqu’à branchement backend)
 */

(function () {
  "use strict";

  /** Numéro WhatsApp équipe MenuGo pour les demandes depuis la landing (chiffres, indicatif inclus, sans espaces obligatoires) */
  const LANDING_SUPPORT_WHATSAPP =
    typeof window.AFRICA_LANDING_WHATSAPP === "string" && window.AFRICA_LANDING_WHATSAPP.trim()
      ? window.AFRICA_LANDING_WHATSAPP.trim()
      : "22399421206";
  const REVEAL_SELECTOR = "[data-reveal]";

  /**
   * Active l’IntersectionObserver si disponible pour ajouter .is-visible.
   */
  function initScrollReveal() {
    const nodes = document.querySelectorAll(REVEAL_SELECTOR);
    if (!nodes.length || !("IntersectionObserver" in window)) {
      nodes.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    nodes.forEach((el) => observer.observe(el));
  }

  /**
   * Les ancres internes : focus clavier sur la cible après navigation
   * (complète scroll-behavior: smooth du CSS)
   */
  function initInternalAnchors() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute("href");
      if (!id || id === "#") return;

      const target = document.querySelector(id);
      if (!target) return;

      // Laisser le navigateur gérer le scroll, puis focus pour l’accessibilité
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
        text || "Bonjour, je souhaite des informations sur MenuGo pour mon restaurant."
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
      var body = "Bonjour MenuGo,\n\n";
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

  document.addEventListener("DOMContentLoaded", () => {
    initLandingWhatsAppLinks();
    initContactForm();
    initSiteHeaderMenu();
    initScrollReveal();
    initInternalAnchors();
    initCtaHooks();
    initFooterYear();
  });
})();
