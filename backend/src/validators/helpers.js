/**
 * Helpers Zod — parsing corps / params avec message HTTP 400 en français.
 */

"use strict";

/**
 * @param {import("zod").ZodError} error
 * @returns {string}
 */
function formatZodError(error) {
  if (!error || !error.issues || !error.issues.length) {
    return "Données invalides.";
  }
  return String(error.issues[0].message || "Données invalides.");
}

/**
 * @template T
 * @param {import("zod").ZodSchema<T>} schema
 * @param {unknown} body
 * @returns {{ ok: true, data: T } | { ok: false, message: string }}
 */
function parseBody(schema, body) {
  var result = schema.safeParse(body);
  if (!result.success) {
    return { ok: false, message: formatZodError(result.error) };
  }
  return { ok: true, data: result.data };
}

/**
 * @template T
 * @param {import("zod").ZodSchema<T>} schema
 * @param {unknown} params
 * @returns {{ ok: true, data: T } | { ok: false, message: string }}
 */
function parseParams(schema, params) {
  return parseBody(schema, params);
}

/**
 * @param {{ ok: false, message: string }} parsed
 * @param {import("express").Response} res
 * @returns {boolean} true si erreur envoyée
 */
function sendValidationError(parsed, res) {
  if (parsed.ok) {
    return false;
  }
  res.status(400).json({ message: parsed.message });
  return true;
}

module.exports = {
  formatZodError: formatZodError,
  parseBody: parseBody,
  parseParams: parseParams,
  sendValidationError: sendValidationError,
};
