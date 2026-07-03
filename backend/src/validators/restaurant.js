/**
 * Validation fiche restaurant (propriétaire).
 */

"use strict";

var { z } = require("zod");
var { parseBody, parseParams } = require("./helpers");
var { parseWhatsappOptional, positiveIntId } = require("./common");
var { normalizeStoredImageUrl } = require("../utils/imageUrlValidation");

var updateRestaurantSchema = z
  .object({
    name: z.string().optional(),
    restaurantName: z.string().optional(),
    description: z.union([z.string(), z.null()]).optional(),
    whatsapp: z.union([z.string(), z.null()]).optional(),
    logo_url: z.union([z.string(), z.null()]).optional(),
    logoUrl: z.union([z.string(), z.null()]).optional(),
    banner_url: z.union([z.string(), z.null()]).optional(),
    bannerUrl: z.union([z.string(), z.null()]).optional(),
    theme_color: z.union([z.string(), z.null()]).optional(),
    themeColor: z.union([z.string(), z.null()]).optional(),
  })
  .superRefine(function (data, ctx) {
    var name = String(data.name || data.restaurantName || "").trim();
    if (!name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le nom du restaurant est requis.",
        path: ["name"],
      });
    }
    var wa = parseWhatsappOptional(data.whatsapp);
    if (!wa.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: wa.message, path: ["whatsapp"] });
    }
    var logoUrl = normalizeStoredImageUrl(data.logo_url || data.logoUrl);
    var bannerUrl = normalizeStoredImageUrl(data.banner_url || data.bannerUrl);
    if (logoUrl === false || bannerUrl === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image invalide. Utilisez une image uploadée par AfricaMenu.",
        path: ["logo_url"],
      });
    }
    var themeRaw = data.theme_color || data.themeColor || "#FF7A00";
    var themeText = themeRaw == null ? "" : String(themeRaw).trim();
    if (themeText && !/^#[0-9A-Fa-f]{6}$/.test(themeText)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Couleur de thème invalide. Exemple : #FF7A00",
        path: ["theme_color"],
      });
    }
  })
  .transform(function (data) {
    var name = String(data.name || data.restaurantName || "").trim().slice(0, 255);
    var desc =
      data.description == null ? null : String(data.description).trim().slice(0, 5000) || null;
    var wa = parseWhatsappOptional(data.whatsapp);
    var themeRaw = data.theme_color || data.themeColor || "#FF7A00";
    var themeText = themeRaw == null ? "" : String(themeRaw).trim();
    return {
      name: name,
      description: desc,
      whatsapp: wa.ok ? wa.value : null,
      logoUrl: normalizeStoredImageUrl(data.logo_url || data.logoUrl),
      bannerUrl: normalizeStoredImageUrl(data.banner_url || data.bannerUrl),
      themeColor: themeText ? themeText.toUpperCase() : "#FF7A00",
    };
  });

function parseUpdateRestaurantBody(body) {
  return parseBody(updateRestaurantSchema, body);
}

var restaurantIdParamsSchema = z.object({
  id: positiveIntId,
});

var menuSuspendedSchema = z
  .object({
    suspended: z.union([z.boolean(), z.number(), z.string()]).optional(),
    menu_suspended: z.union([z.boolean(), z.number(), z.string()]).optional(),
  })
  .transform(function (data) {
    var raw = data.suspended != null ? data.suspended : data.menu_suspended;
    return raw === true || raw === 1 || raw === "1" || raw === "true";
  });

function parseRestaurantIdParams(params) {
  return parseParams(restaurantIdParamsSchema, params);
}

function parseMenuSuspendedBody(body) {
  return parseBody(menuSuspendedSchema, body);
}

module.exports = {
  parseUpdateRestaurantBody: parseUpdateRestaurantBody,
  parseRestaurantIdParams: parseRestaurantIdParams,
  parseMenuSuspendedBody: parseMenuSuspendedBody,
};
