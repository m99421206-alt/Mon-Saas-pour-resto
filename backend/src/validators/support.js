/**
 * Validation messages support / notifications restaurant.
 */

"use strict";

var { z } = require("zod");
var { parseBody } = require("./helpers");
var { parseWhatsappRequired } = require("./common");

var adminNotifySchema = z.object({
  type: z.enum(["support", "subscription", "issue"], {
    errorMap: function () {
      return { message: "Type invalide (support, subscription ou issue)." };
    },
  }),
  detail: z
    .string()
    .trim()
    .max(500, "Le message ne doit pas dépasser 500 caractères.")
    .optional()
    .transform(function (v) {
      return v || "";
    }),
});

var passwordResetRequestSchema = z
  .object({
    restaurantName: z.string().trim().max(160).optional(),
    restaurant_name: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(32).optional(),
  })
  .superRefine(function (data, ctx) {
    var name = String(data.restaurantName || data.restaurant_name || "").trim();
    var phone = String(data.phone || "").trim();
    if (!name && !phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indiquez au moins le nom du restaurant ou un téléphone.",
        path: ["restaurantName"],
      });
    }
  })
  .transform(function (data) {
    return {
      restaurantName: String(data.restaurantName || data.restaurant_name || "").trim().slice(0, 160),
      phone: String(data.phone || "").trim().slice(0, 32),
    };
  });

function parseAdminNotifyBody(body) {
  return parseBody(adminNotifySchema, body);
}

function parsePasswordResetRequestBody(body) {
  return parseBody(passwordResetRequestSchema, body);
}

var installationRequestSchema = z
  .object({
    restaurantName: z
      .string({ required_error: "Le nom du restaurant est obligatoire." })
      .trim()
      .min(1, "Le nom du restaurant est obligatoire.")
      .max(160, "Le nom ne doit pas dépasser 160 caractères."),
    fullName: z
      .string({ required_error: "Votre nom est obligatoire." })
      .trim()
      .min(1, "Votre nom est obligatoire.")
      .max(160, "Le nom ne doit pas dépasser 160 caractères."),
    whatsapp: z.string().optional(),
    phone: z.string().optional(),
    city: z.string().optional(),
    quartier: z.string().optional(),
  })
  .superRefine(function (data, ctx) {
    var rawPhone =
      typeof data.whatsapp === "string" && data.whatsapp.trim() ?
        data.whatsapp
      : typeof data.phone === "string" && data.phone.trim() ?
        data.phone
      : "";
    var wa = parseWhatsappRequired(rawPhone || null);
    if (!wa.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: wa.message, path: ["whatsapp"] });
    }
    var cityVal = String(data.city || data.quartier || "").trim();
    if (!cityVal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indiquez votre ville.",
        path: ["city"],
      });
    }
  })
  .transform(function (data) {
    var rawPhone =
      typeof data.whatsapp === "string" && data.whatsapp.trim() ?
        data.whatsapp
      : typeof data.phone === "string" && data.phone.trim() ?
        data.phone
      : "";
    var wa = parseWhatsappRequired(rawPhone || null);
    return {
      restaurantName: data.restaurantName,
      fullName: data.fullName,
      whatsapp: wa.ok ? wa.value : "",
      city: String(data.city || data.quartier || "").trim().slice(0, 120),
    };
  });

function parseInstallationRequestBody(body) {
  return parseBody(installationRequestSchema, body);
}

module.exports = {
  parseAdminNotifyBody: parseAdminNotifyBody,
  parsePasswordResetRequestBody: parsePasswordResetRequestBody,
  parseInstallationRequestBody: parseInstallationRequestBody,
};
