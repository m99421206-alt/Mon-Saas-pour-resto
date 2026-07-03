/**
 * Validation profil utilisateur et actions admin sur les comptes.
 */

"use strict";

var { z } = require("zod");
var { parseBody, parseParams } = require("./helpers");
var { positiveIntId, passwordField } = require("./common");

var userIdParamsSchema = z.object({
  id: positiveIntId,
});

var patchUserStatusSchema = z.object({
  status: z
    .string({ required_error: "Statut obligatoire." })
    .trim()
    .toLowerCase()
    .refine(function (v) {
      return v === "active" || v === "suspended";
    }, "Statut invalide (active ou suspended)."),
});

var adminResetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().optional(),
    passwordConfirm: z.string().optional(),
  })
  .superRefine(function (data, ctx) {
    var confirm =
      data.confirmPassword != null ? data.confirmPassword : data.passwordConfirm != null ? data.passwordConfirm : "";
    if (String(confirm) !== String(data.password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Les mots de passe ne correspondent pas.",
        path: ["confirmPassword"],
      });
    }
  });

function parseUserIdParams(params) {
  return parseParams(userIdParamsSchema, params);
}

function parsePatchUserStatusBody(body) {
  return parseBody(patchUserStatusSchema, body);
}

function parseAdminResetPasswordBody(body) {
  return parseBody(adminResetPasswordSchema, body);
}

module.exports = {
  parseUserIdParams: parseUserIdParams,
  parsePatchUserStatusBody: parsePatchUserStatusBody,
  parseAdminResetPasswordBody: parseAdminResetPasswordBody,
};
