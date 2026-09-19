/**
 * Validation — demandes d'assistance installation (admin CRM).
 */

"use strict";

var { z } = require("zod");
var { parseBody, parseParams } = require("./helpers");
var { positiveIntId, passwordField, emailField } = require("./common");
var setupAssistanceService = require("../services/setupAssistanceService");

var requestIdParamsSchema = z.object({
  id: positiveIntId,
});

var patchSetupHelpStatusSchema = z.object({
  status: z
    .string({ required_error: "Statut obligatoire." })
    .trim()
    .toLowerCase()
    .refine(function (v) {
      return setupAssistanceService.VALID_STATUSES.indexOf(v) !== -1;
    }, "Statut invalide."),
});

var linkSetupHelpRestaurantSchema = z
  .object({
    linked_restaurant_id: positiveIntId.optional(),
    restaurantId: positiveIntId.optional(),
  })
  .superRefine(function (data, ctx) {
    if (data.linked_restaurant_id == null && data.restaurantId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Identifiant restaurant obligatoire.",
        path: ["linked_restaurant_id"],
      });
    }
  })
  .transform(function (data) {
    return {
      linked_restaurant_id:
        data.linked_restaurant_id != null ? data.linked_restaurant_id : data.restaurantId,
    };
  });

var addNoteSchema = z.object({
  note: z
    .string({ required_error: "Note obligatoire." })
    .trim()
    .min(1, "Note obligatoire.")
    .max(2000, "La note ne doit pas dépasser 2000 caractères."),
  text: z.string().trim().max(2000).optional(),
}).transform(function (data) {
  return {
    note: data.note || data.text || "",
  };
});

var checklistSchema = z.object({
  checklist: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
}).transform(function (data) {
  return { checklist: data.checklist || {} };
});

var createRestaurantFromRequestSchema = z
  .object({
    email: emailField,
    password: passwordField,
    restaurantName: z.string().trim().max(255).optional(),
    fullName: z.string().trim().max(160).optional(),
    whatsapp: z.string().trim().max(32).optional(),
    quartier: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
  })
  .transform(function (data) {
    return {
      email: data.email,
      password: data.password,
      restaurantName: data.restaurantName,
      fullName: data.fullName,
      whatsapp: data.whatsapp,
      quartier: data.quartier || data.city || "",
    };
  });

function parseSetupHelpIdParams(params) {
  return parseParams(requestIdParamsSchema, params);
}

function parsePatchSetupHelpStatusBody(body) {
  return parseBody(patchSetupHelpStatusSchema, body);
}

function parseLinkSetupHelpRestaurantBody(body) {
  return parseBody(linkSetupHelpRestaurantSchema, body);
}

function parseAddNoteBody(body) {
  return parseBody(addNoteSchema, body);
}

function parseChecklistBody(body) {
  return parseBody(checklistSchema, body);
}

function parseCreateRestaurantFromRequestBody(body) {
  return parseBody(createRestaurantFromRequestSchema, body);
}

function parseSetupHelpListQuery(query) {
  var filter = typeof query.filter === "string" ? query.filter.trim().toLowerCase() : "all";
  var allowed = [
    "all",
    "new",
    "to_contact",
    "in_progress",
    "to_review",
    "completed",
    "cancelled",
    "active",
  ];
  if (allowed.indexOf(filter) === -1) {
    filter = "all";
  }
  var q = typeof query.q === "string" ? query.q.trim().slice(0, 160) : "";
  var page = Number(query.page);
  var pageSize = Number(query.pageSize);
  return {
    filter: filter,
    q: q,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 50,
  };
}

module.exports = {
  parseSetupHelpIdParams: parseSetupHelpIdParams,
  parsePatchSetupHelpStatusBody: parsePatchSetupHelpStatusBody,
  parseLinkSetupHelpRestaurantBody: parseLinkSetupHelpRestaurantBody,
  parseAddNoteBody: parseAddNoteBody,
  parseChecklistBody: parseChecklistBody,
  parseCreateRestaurantFromRequestBody: parseCreateRestaurantFromRequestBody,
  parseSetupHelpListQuery: parseSetupHelpListQuery,
};
