/**
 * Validation messages support / notifications restaurant.
 */

"use strict";

var { z } = require("zod");
var { parseBody } = require("./helpers");

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

module.exports = {
  parseAdminNotifyBody: parseAdminNotifyBody,
  parsePasswordResetRequestBody: parsePasswordResetRequestBody,
};
