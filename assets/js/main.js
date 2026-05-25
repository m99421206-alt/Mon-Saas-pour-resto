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
        text || "Bonjour, je souhaite des informations sur AfricaMenu pour mon restaurant."
      );
      link.href = `https://wa.me/${digits}?text=${encoded}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initLandingWhatsAppLinks();
    initScrollReveal();
    initInternalAnchors();
    initCtaHooks();
    initFooterYear();
  });
})();
