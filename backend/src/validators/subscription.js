/**
 * Validation actions abonnements (admin).
 */

"use strict";

var { z } = require("zod");
var { parseBody, parseParams } = require("./helpers");
var { positiveIntId } = require("./common");

var restaurantIdParamsSchema = z.object({
  restaurantId: positiveIntId,
});

var activateSchema = z.object({
  period_days: z.coerce.number().int().min(1).max(3650).optional().default(30),
  subscription_amount_cfa: z.coerce.number().finite().min(0).max(999999999).optional().nullable(),
  subscription_plan_key: z
    .string()
    .trim()
    .max(48)
    .optional()
    .nullable()
    .transform(function (v) {
      if (v == null || v === "") {
        return null;
      }
      return String(v).toLowerCase().replace(/[^a-z0-9_-]/g, "") || null;
    }),
});

var renewSchema = z.object({
  months: z.coerce.number().int().min(1).max(120).optional().default(12),
  subscription_amount_cfa: z.coerce.number().finite().min(0).max(999999999).optional().nullable(),
  subscription_plan_key: z
    .string()
    .trim()
    .max(48)
    .optional()
    .nullable()
    .transform(function (v) {
      if (v == null || v === "") {
        return null;
      }
      return String(v).toLowerCase().replace(/[^a-z0-9_-]/g, "") || null;
    }),
});

var adjustSchema = z
  .object({
    subscription_ends_at: z.string().trim().optional(),
    add_days: z.coerce.number().int().optional(),
    subscription_plan_key: z.union([z.string(), z.null()]).optional(),
  })
  .superRefine(function (data, ctx) {
    var endsExplicit =
      typeof data.subscription_ends_at === "string" ?
        data.subscription_ends_at.trim().slice(0, 32)
      : "";
    var hasExplicit = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endsExplicit);
    var addDaysNum = Number(data.add_days);
    var touchesEndByDate = hasExplicit;
    var touchesEndByDays = Number.isFinite(addDaysNum) && addDaysNum !== 0;
    var touchesPlan = Object.prototype.hasOwnProperty.call(data, "subscription_plan_key");

    if (!touchesEndByDate && !touchesEndByDays && !touchesPlan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Indiquez subscription_ends_at (AAAA-MM-DD), add_days (nombre de jours) et/ou subscription_plan_key.",
      });
    }
    if (touchesEndByDate && touchesEndByDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Utilisez soit subscription_ends_at soit add_days, pas les deux simultanément.",
      });
    }
    if (touchesEndByDays) {
      var adb = Math.round(addDaysNum);
      if (adb < -3660 || adb > 3660) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "add_days doit être compris entre -3660 et 3660.",
        });
      }
    }
  })
  .transform(function (data) {
    var endsExplicit =
      typeof data.subscription_ends_at === "string" ?
        data.subscription_ends_at.trim().slice(0, 32)
      : "";
    var hasExplicit = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endsExplicit);
    var addDaysNum = Number(data.add_days);
    var planClean = null;
    if (Object.prototype.hasOwnProperty.call(data, "subscription_plan_key")) {
      var raw = data.subscription_plan_key === "" ? null : data.subscription_plan_key;
      planClean =
        raw == null ? null : String(raw).trim().toLowerCase().slice(0, 48).replace(/[^a-z0-9_-]/g, "") || null;
    }
    return {
      endsExplicit: hasExplicit ? endsExplicit : "",
      addDays: Number.isFinite(addDaysNum) && addDaysNum !== 0 ? Math.round(addDaysNum) : null,
      planKey: planClean,
      touchesPlan: Object.prototype.hasOwnProperty.call(data, "subscription_plan_key"),
    };
  });

function parseRestaurantIdParams(params) {
  return parseParams(restaurantIdParamsSchema, params);
}

function parseActivateBody(body) {
  return parseBody(activateSchema, body);
}

function parseRenewBody(body) {
  return parseBody(renewSchema, body);
}

function parseAdjustBody(body) {
  return parseBody(adjustSchema, body);
}

module.exports = {
  parseRestaurantIdParams: parseRestaurantIdParams,
  parseActivateBody: parseActivateBody,
  parseRenewBody: parseRenewBody,
  parseAdjustBody: parseAdjustBody,
};
