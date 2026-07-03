/**
 * Validation catégories menu.
 */

"use strict";

var { z } = require("zod");
var { parseBody, parseParams } = require("./helpers");
var { positiveIntId } = require("./common");

var categoryBodySchema = z.object({
  name: z
    .string({ required_error: "Le nom de la catégorie est requis." })
    .trim()
    .min(1, "Le nom de la catégorie est requis.")
    .max(255, "Le nom ne doit pas dépasser 255 caractères."),
});

var categoryIdParamsSchema = z.object({
  id: positiveIntId,
});

function parseCategoryBody(body) {
  return parseBody(categoryBodySchema, body);
}

function parseCategoryIdParams(params) {
  return parseParams(categoryIdParamsSchema, params);
}

module.exports = {
  parseCategoryBody: parseCategoryBody,
  parseCategoryIdParams: parseCategoryIdParams,
};
