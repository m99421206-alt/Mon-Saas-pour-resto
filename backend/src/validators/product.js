/**
 * Validation produits menu.
 */

"use strict";

var { z } = require("zod");
var { parseBody, parseParams } = require("./helpers");
var { positiveIntId, boolLikeField } = require("./common");
var { normalizeStoredImageUrl } = require("../utils/imageUrlValidation");

var variantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.coerce.number().finite().min(0),
  image: z.union([z.string(), z.null()]).optional(),
});

var productBodySchema = z
  .object({
    name: z
      .string({ required_error: "Le nom du produit est requis." })
      .trim()
      .min(1, "Le nom du produit est requis.")
      .max(255, "Le nom ne doit pas dépasser 255 caractères."),
    description: z.union([z.string(), z.null()]).optional(),
    price: z.coerce.number({ invalid_type_error: "Le prix doit être un nombre positif ou nul." }).finite().min(0),
    category_id: positiveIntId,
    image: z.union([z.string(), z.null()]).optional(),
    has_sizes: boolLikeField.optional(),
    is_visible: boolLikeField.optional(),
    variants: z.array(variantSchema).max(24).optional(),
  })
  .superRefine(function (data, ctx) {
    var image = normalizeStoredImageUrl(data.image);
    if (image === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image invalide. Utilisez une image uploadée par AfricaMenu.",
        path: ["image"],
      });
    }
  })
  .transform(function (data) {
    var description =
      data.description == null ? null : String(data.description).trim().slice(0, 5000) || null;
    var hasSizes = data.has_sizes != null ? data.has_sizes : 1;
    var variants = [];
    if (Array.isArray(data.variants)) {
      data.variants.forEach(function (item) {
        if (item && item.name && Number.isFinite(item.price) && item.price >= 0) {
          variants.push({
            name: item.name.trim().slice(0, 100),
            price: Number(Number(item.price).toFixed(2)),
            image: null,
            sort_order: variants.length,
          });
        }
      });
    }
    if (hasSizes && !variants.length) {
      hasSizes = 0;
    }
    return {
      name: data.name.trim(),
      description: description,
      price: Number(Number(data.price).toFixed(2)),
      categoryId: data.category_id,
      image: normalizeStoredImageUrl(data.image),
      hasSizes: hasSizes,
      isVisible: data.is_visible != null ? data.is_visible : 1,
      variants: variants,
    };
  });

var productIdParamsSchema = z.object({
  id: positiveIntId,
});

function parseProductBody(body) {
  return parseBody(productBodySchema, body);
}

function parseProductIdParams(params) {
  return parseParams(productIdParamsSchema, params);
}

module.exports = {
  parseProductBody: parseProductBody,
  parseProductIdParams: parseProductIdParams,
};
