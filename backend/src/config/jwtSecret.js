/**
 * Configuration JWT — lecture depuis process.env (.env) et validation au démarrage.
 */

"use strict";

var PLACEHOLDER_SECRETS = ["changez_moi_cle_longue_aleatoire"];

var MIN_SECRET_LENGTH = 32;

function getJwtSecretFromEnv() {
  return String(process.env.JWT_SECRET || "").trim();
}

/**
 * Valide JWT_SECRET avant le démarrage du serveur.
 * - Toujours : refus si absent ou vide.
 * - Production : refus si placeholder ou longueur < 32.
 * - Développement : avertissement si < 32 (JWT existants conservés).
 */
function validateJwtSecretAtStartup() {
  var secret = getJwtSecretFromEnv();
  var isProduction = process.env.NODE_ENV === "production";

  if (!secret) {
    throw new Error(
      "JWT_SECRET manquant : ajoutez une clé secrète dans backend/.env (copiez .env.example). " +
        "Générez une clé aléatoire, par ex. : openssl rand -hex 32",
    );
  }

  if (isProduction) {
    if (PLACEHOLDER_SECRETS.indexOf(secret) !== -1) {
      throw new Error(
        "JWT_SECRET invalide en production : remplacez la valeur par défaut de .env.example " +
          "par une clé aléatoire unique (32 caractères minimum). Ex. : openssl rand -hex 32",
      );
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        "JWT_SECRET trop court pour la production : " +
          secret.length +
          " caractère(s) détecté(s), minimum " +
          MIN_SECRET_LENGTH +
          ". Générez une clé plus longue dans backend/.env (ex. openssl rand -hex 32).",
      );
    }
    return;
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    console.warn(
      "[AfricaMenu] JWT_SECRET : " +
        secret.length +
        " caractère(s) — acceptable en développement, mais utilisez au moins " +
        MIN_SECRET_LENGTH +
        " caractères avant NODE_ENV=production.",
    );
  }
  if (PLACEHOLDER_SECRETS.indexOf(secret) !== -1) {
    console.warn(
      "[AfricaMenu] JWT_SECRET utilise encore la valeur par défaut de .env.example — " +
        "changez-la avant la mise en production.",
    );
  }
}

module.exports = {
  getJwtSecret: getJwtSecretFromEnv,
  validateJwtSecretAtStartup: validateJwtSecretAtStartup,
  MIN_SECRET_LENGTH: MIN_SECRET_LENGTH,
};
