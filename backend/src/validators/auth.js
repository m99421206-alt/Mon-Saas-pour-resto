/**
 * Validation authentification — connexion / inscription.
 */

"use strict";

var { z } = require("zod");
var { parseBody } = require("./helpers");
var {
  emailField,
  passwordField,
  parseWhatsappRequired,
  pickQuartier,
} = require("./common");

var loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: "Mot de passe obligatoire." }).min(1, "Mot de passe obligatoire."),
});

var registerSchema = z
  .object({
    email: emailField,
    password: passwordField,
    restaurantName: z
      .string()
      .trim()
      .max(255)
      .optional()
      .transform(function (v) {
        return v && v.length ? v : "Mon restaurant";
      }),
    fullName: z
      .string({ required_error: "Le nom du gérant est obligatoire." })
      .trim()
      .min(1, "Le nom du gérant est obligatoire.")
      .max(160, "Le nom ne doit pas dépasser 160 caractères."),
    whatsapp: z.string().optional(),
    phone: z.string().optional(),
    city: z.string().optional(),
    location: z.string().optional(),
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
    if (!pickQuartier(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indiquez le quartier où se trouve votre restaurant.",
        path: ["quartier"],
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
      email: data.email,
      password: data.password,
      restaurantName: data.restaurantName,
      fullName: data.fullName,
      whatsapp: wa.ok ? wa.value : "",
      quartier: pickQuartier(data) || "",
    };
  });

function parseLoginBody(body) {
  return parseBody(loginSchema, body);
}

function parseRegisterBody(body) {
  return parseBody(registerSchema, body);
}

module.exports = {
  parseLoginBody: parseLoginBody,
  parseRegisterBody: parseRegisterBody,
};
