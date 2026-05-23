/**
 * Rendu UI « Mon abonnement » (restaurant) pour une page dédiée.
 * Données : réponse GET /api/me ({ subscription, plans_catalog, restaurant, user }).
 */
(function () {
  "use strict";

  /** @type {HTMLElement|null} el */
  var catalogPanelRef = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      switch (ch) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#039;";
      }
    });
  }

  function formatCFA(n) {
    var x = Math.round(Number(n) || 0);
    return new Intl.NumberFormat("fr-FR").format(x) + " F CFA";
  }

  /** @param {string|null|undefined} iso */
  function formatDateFr(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  /** @param {string|null|undefined} raw */
  function waDigits(raw) {
    return String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  }

  /** @returns {boolean} */
  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
  }

  function statusLabel(status) {
    var st = String(status || "").toLowerCase();
    if (st === "active") return "Actif";
    if (st === "expired") return "Expiré";
    if (st === "suspended") return "Suspendu";
    return "Essai gratuit";
  }

  function badgeClass(status) {
    var st = String(status || "").toLowerCase();
    if (st === "active") return "dash-my-sub-badge--active";
    if (st === "expired") return "dash-my-sub-badge--expired";
    if (st === "suspended") return "dash-my-sub-badge--suspended";
    return "dash-my-sub-badge--trial";
  }

  function wrapperClass(status) {
    var st = String(status || "").toLowerCase();
    if (st === "active") return "dash-my-sub--active";
    if (st === "expired") return "dash-my-sub--expired";
    if (st === "suspended") return "dash-my-sub--suspended";
    return "dash-my-sub--trial";
  }

  function togglePlans(button) {
    if (!catalogPanelRef) return;
    var open = catalogPanelRef.hasAttribute("hidden");
    catalogPanelRef.toggleAttribute("hidden", !open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /**
   * @param {HTMLElement|null} rootEl
   * @param {object} me
   */
  function renderInto(rootEl, me) {
    catalogPanelRef = null;
    if (!rootEl) return;
    rootEl.textContent = "";

    var cfg = window.AFRICAMENU_CONFIG || {};

    /** @type {object|null} */
    var subscription = me && me.subscription ? me.subscription : null;
    if (!subscription) {
      var wrap = document.createElement("section");
      wrap.className = "dash-my-sub";
      wrap.setAttribute("aria-labelledby", "dash-my-sub-title");
      var inner = document.createElement("div");
      inner.className = "dash-my-sub__card";
      inner.innerHTML =
        "<div class=\"dash-my-sub__head\"><div class=\"dash-my-sub__titlewrap\"><h2 id=\"dash-my-sub-title\">Mon abonnement</h2></div></div>" +
        '<p class="dash-my-sub__muted">Aucune information d’abonnement n’est encore disponible pour ce compte.</p>';
      wrap.appendChild(inner);
      rootEl.appendChild(wrap);
      return;
    }

    var status = String(subscription.status || "trial").toLowerCase();

    var rawPlanLabel =
      status === "trial" ?
        "Essai gratuit"
      : String(subscription.plan_label || "").trim();
    var planHeaderMuted = escapeHtml(rawPlanLabel || "Plan");

    /** @type {Array<object>} */
    var catalog =
      Array.isArray(me.plans_catalog) ? me.plans_catalog.slice() : [];

    /** @type {object|null} */
    var restaurant = me.restaurant || null;
    var restoName = restaurant && restaurant.name ? String(restaurant.name) : "Mon restaurant";

    var supportMail = cfg.SUPPORT_EMAIL && String(cfg.SUPPORT_EMAIL).trim();
    supportMail = supportMail && isValidEmail(supportMail) ? supportMail.trim() : "";

    var supportWa = cfg.SUPPORT_WHATSAPP ? waDigits(cfg.SUPPORT_WHATSAPP) : "";
    var restoWa =
      restaurant && restaurant.whatsapp ? waDigits(restaurant.whatsapp) : "";

    var section = document.createElement("section");
    section.className = "dash-my-sub " + wrapperClass(status);
    section.setAttribute("aria-labelledby", "dash-my-sub-title");
    section.setAttribute("tabindex", "-1");

    var card = document.createElement("div");
    card.className = "dash-my-sub__card";

    var header = document.createElement("div");
    header.className = "dash-my-sub__head";
    header.innerHTML =
      '<div class="dash-my-sub__titlewrap">' +
      '<h2 id="dash-my-sub-title">' +
      '<span class="dash-my-sub__icon" aria-hidden="true">📦</span>' +
      "Mon abonnement" +
      "</h2>" +
      '<div class="dash-my-sub__badge-line">' +
      '<span class="dash-my-sub-badge ' +
      badgeClass(status) +
      '" data-sub-role="badge">' +
      escapeHtml(statusLabel(status)) +
      "</span>" +
      (status !== "trial" ?
        '<span class="dash-my-sub__muted">' + planHeaderMuted + "</span>"
      : "") +
      "</div>" +
      "</div>";

    card.appendChild(header);

    /** @type {{ text?: string, lines?: string[], lineClasses?: string[], mod: string }[]} */
    var alerts = [];

    if (status === "trial") {
      var trialDays =
        subscription.trial_display_days !== undefined &&
        subscription.trial_display_days !== null ?
          Number(subscription.trial_display_days)
        : NaN;
      if (!Number.isFinite(trialDays) || trialDays < 1) trialDays = 30;

      var dr =
        subscription.days_remaining !== undefined && subscription.days_remaining !== null ?
          Number(subscription.days_remaining)
        : NaN;

      var offer = subscription.post_trial_offer;

      var lead =
        trialDays <= 1 ?
          "Vous profitez actuellement de l’essai gratuit (dernier jour)."
        : "Vous profitez actuellement de l’essai gratuit de " + trialDays + " jours.";

      /** @type {string[]} */
      var trialLines = [lead];
      /** @type {string[]} */
      var trialLineClasses = [""];

      if (Number.isFinite(dr)) {
        trialLines.push(
          dr === 0 ?
            "Essai terminé aujourd’hui."
          : dr === 1 ?
            "Il reste 1 jour."
          : "Il reste " + dr + " jours.",
        );
        trialLineClasses.push(
          "dash-my-sub__trial-countdown dash-my-sub__muted",
        );
      }

      if (offer && offer.plan_label) {
        var moOffer = Math.max(1, Math.round(Number(offer.months) || 1));
        var priceShown = formatCFA(offer.price_cfa || 0);
        var freq = moOffer === 1 ? "/mois" : " pour " + moOffer + " mois";
        var planResume =
          String(offer.plan_label).trim() +
          " — " +
          priceShown +
          freq;
        trialLines.push("Après expiration :");
        trialLineClasses.push("dash-my-sub__trial-after-label");
        trialLines.push(planResume);
        trialLineClasses.push("dash-my-sub__trial-plan-line");
      }

      alerts.push({
        mod: "dash-my-sub__alert--trial",
        lines: trialLines,
        lineClasses: trialLineClasses,
      });
    } else if (status === "expired") {
      alerts.push({
        text:
          "Votre abonnement est arrivé à échéance. Renouvellement ou contact équipe nécessaires pour corriger votre accès aux écrans du menu.",
        mod: "dash-my-sub__alert--expired",
      });
      var eo = subscription.post_trial_offer || null;
      if (eo && eo.plan_label && Number(eo.price_cfa || 0) >= 0) {
        var moEo = Math.max(1, Math.round(Number(eo.months) || 1));
        var freqEo = moEo === 1 ? "/mois" : " pour " + moEo + " mois";
        alerts.push({
          text:
            "Après renouvellement : " +
            String(eo.plan_label).trim() +
            " — " +
            formatCFA(eo.price_cfa) +
            freqEo,
          mod: "dash-my-sub__alert--muted",
        });
      }
    } else if (status === "suspended") {
      alerts.push({
        text:
          "Votre compte ou abonnement est suspendu par l’administrateur. Merci de contacter le support pour une réactivation.",
        mod: "dash-my-sub__alert--muted",
      });
    }

    for (var a = 0; a < alerts.length; a += 1) {
      var aa = alerts[a];
      var ac = document.createElement("div");
      ac.className = ("dash-my-sub__alert " + aa.mod).trim();
      if (aa.lines && aa.lines.length) {
        for (var li = 0; li < aa.lines.length; li += 1) {
          var pLi = document.createElement("p");
          pLi.className = aa.lineClasses ? aa.lineClasses[li] || "" : "";
          pLi.textContent = aa.lines[li];
          ac.appendChild(pLi);
        }
      } else {
        ac.textContent = aa.text;
      }
      card.appendChild(ac);
    }

    var billingMonths = subscription.billing_period_months;
    if (!Number.isFinite(Number(billingMonths)) || Number(billingMonths) < 1)
      billingMonths = 1;
    var bm = Math.round(Number(billingMonths));

    var gridItems = [];

    gridItems.push({
      label: "Statut",
      val: escapeHtml(statusLabel(status)),
    });
    gridItems.push({
      label: "Début",
      val: escapeHtml(formatDateFr(subscription.started_at)),
    });
    gridItems.push({
      label: "Fin",
      val: escapeHtml(formatDateFr(subscription.ends_at)),
    });

    var priceLine =
      status === "trial" ?
        "0 — période d’essai"
      : escapeHtml(formatCFA(subscription.display_price_cfa || 0));
    gridItems.push({
      label: "Tarif affiché",
      val: priceLine,
    });

    gridItems.push({
      label: "Période facturée",
      val:
        bm <= 1 ? "Renouvellement mensuel (~1 mois)" : "Tous les " + bm + " mois",
    });

    if (
      subscription.days_remaining !== undefined &&
      subscription.days_remaining !== null &&
      subscription.ends_at &&
      status !== "expired"
    ) {
      gridItems.push({
        label: "Jours avant échéance",
        val: escapeHtml(String(subscription.days_remaining)),
      });
    }

    var grid = document.createElement("div");
    grid.className = "dash-my-sub__grid";
    grid.setAttribute("aria-label", "Détails de l’offre");

    for (var g = 0; g < gridItems.length; g += 1) {
      var it = gridItems[g];
      var cell = document.createElement("article");
      cell.className = "dash-my-sub__item";
      cell.innerHTML =
        '<span class="dash-my-sub__item-label">' +
        escapeHtml(it.label) +
        "</span>" +
        '<div class="dash-my-sub__item-val">' +
        it.val +
        "</div>";
      grid.appendChild(cell);
    }

    card.appendChild(grid);

    var ctaRow = document.createElement("div");
    ctaRow.className = "dash-my-sub__cta-row";

    function appendBtn(el) {
      ctaRow.appendChild(el);
    }

    var mailSubject =
      "Renouvellement abonnement — " +
      restoName +
      " (plan " +
      String(subscription.plan_key || "").trim() +
      ")";

    if (
      status === "expired" ||
      status === "suspended" ||
      status === "trial" ||
      supportMail
    ) {
      if (supportMail) {
        var renewBody =
          "Bonjour,\n\n" +
          "Je souhaite renouveler ou corriger mon abonnement.\n\n" +
          "Restaurant : " +
          restoName +
          "\nStatut affiché : " +
          statusLabel(status) +
          "\n\nMerci.\n";
        var renew = document.createElement("a");
        renew.className = "dash-my-sub__btn dash-my-sub__btn--renew";
        renew.href =
          "mailto:" +
          supportMail +
          "?subject=" +
          encodeURIComponent(mailSubject) +
          "&body=" +
          encodeURIComponent(renewBody);
        renew.textContent =
          status === "trial" ? "Questions sur l’abonnement" : "Renouveler par e-mail";
        appendBtn(renew);
      }
    }

    var waTarget = supportWa || restoWa;
    if (waTarget) {
      var msg =
        "Bonjour,%20je%20souhaite%20en%20savoir%20plus%20sur%20mon%20abonnement%20AfricaMenu%20(" +
        encodeURIComponent(restoName) +
        ")";
      var whats = document.createElement("a");
      whats.className = "dash-my-sub__btn dash-my-sub__btn--whatsapp";
      whats.rel = "noopener noreferrer";
      whats.target = "_blank";
      whats.href = "https://wa.me/" + waTarget + "?text=" + msg;
      whats.innerHTML =
        escapeHtml(restoWa && !supportWa ? "Écrire sur WhatsApp du resto" : "WhatsApp");
      appendBtn(whats);
    } else if (!supportMail && (status === "expired" || status === "suspended")) {
      var gh = document.createElement("button");
      gh.type = "button";
      gh.className = "dash-my-sub__btn dash-my-sub__btn--ghost";
      gh.disabled = true;
      gh.textContent = "Contact support (réglé dans config)";
      gh.title =
        'Ajoutez SUPPORT_EMAIL ou SUPPORT_WHATSAPP dans config.js ou le numéro dans Paramètres.';
      appendBtn(gh);
    }

    var btnPlans = document.createElement("button");
    btnPlans.type = "button";
    btnPlans.className = "dash-my-sub__btn dash-my-sub__btn--plans";
    btnPlans.setAttribute("aria-expanded", "false");
    btnPlans.setAttribute("aria-controls", "restaurant-sub-catalog");
    btnPlans.textContent = "Voir les plans";
    btnPlans.disabled = catalog.length === 0;
    btnPlans.addEventListener("click", function () {
      togglePlans(btnPlans);
    });
    appendBtn(btnPlans);

    card.appendChild(ctaRow);

    var catalogPanel = document.createElement("div");
    catalogPanel.className = "dash-my-sub__plans-panel";
    catalogPanel.id = "restaurant-sub-catalog";
    catalogPanel.hidden = true;
    catalogPanelRef = catalogPanel;

    if (catalog.length) {
      var pt = document.createElement("h3");
      pt.className = "dash-my-sub__plans-title";
      pt.textContent = "Plans proposés (tarifs indicatifs)";
      catalogPanel.appendChild(pt);

      var ul = document.createElement("ul");
      ul.className = "dash-my-sub__plans-cards";
      ul.setAttribute("role", "list");

      catalog.forEach(function (p) {
        var id = escapeHtml(String(p.id || ""));
        var name = escapeHtml(String(p.name || "Plan"));
        var price =
          Number(p.price_cfa) > 0 ? formatCFA(p.price_cfa) : "Offert ou sur devis";

        var li = document.createElement("li");
        li.className = "dash-my-sub__plan-mini";
        li.innerHTML =
          '<div class="dash-my-sub__plan-mini-title">' +
          name +
          "</div>" +
          '<div class="dash-my-sub__plan-mini-id">Identifiant : ' +
          id +
          "</div>" +
          "<div>" +
          price +
          " — facturation tous les " +
          escapeHtml(String(Math.max(1, Math.round(Number(p.months) || 1)))) +
          " mois</div>";
        ul.appendChild(li);
      });

      catalogPanel.appendChild(ul);

      catalogPanel.appendChild(
        (function () {
          var muted = document.createElement("p");
          muted.className = "dash-my-sub__muted";
          muted.style.marginTop = "0.75rem";
          muted.textContent =
            "Tarifs définis par la plateforme : la facturation finale est confirmée après contact avec l’équipe.";
          return muted;
        })(),
      );
    } else {
      var fallback = document.createElement("p");
      fallback.className = "dash-my-sub__muted";
      fallback.textContent = "Liste des plans en cours de configuration.";
      catalogPanel.appendChild(fallback);
    }

    card.appendChild(catalogPanel);
    section.appendChild(card);
    rootEl.appendChild(section);
  }

  window.AfricaMenuRestaurantSubscription = { renderInto: renderInto };
})();
