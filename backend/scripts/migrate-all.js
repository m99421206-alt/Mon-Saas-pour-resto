/**
 * Exécute toutes les migrations incrémentielles (bases déjà existantes).
 * Usage (depuis backend/) : npm run db:migrate-all
 *
 * Ne remplace pas db:schema (installation neuve).
 * Chaque script est idempotent — safe à relancer après git pull.
 */

require("dotenv").config();

var childProcess = require("child_process");
var path = require("path");

var migrations = [
  { file: "migrate-restaurant-settings.js", label: "Paramètres restaurant / variantes produits" },
  { file: "migrate-admin-timestamps.js", label: "Horodatage users / products" },
  { file: "migrate-audit-log.js", label: "Journal d'audit" },
  { file: "migrate-audit-impersonation.js", label: "Audit impersonation admin" },
  { file: "migrate-user-account-status.js", label: "Statut compte utilisateur" },
  { file: "migrate-admin-restaurants.js", label: "Colonnes admin restaurants" },
  { file: "migrate-restaurant-slugs.js", label: "Slugs publics restaurants" },
  { file: "migrate-admin-subscriptions.js", label: "Dates abonnement restaurant" },
  { file: "migrate-subscription-plan-key.js", label: "Clé de plan abonnement" },
  { file: "migrate-admin-platform-settings.js", label: "Paramètres plateforme" },
  { file: "migrate-onboarding-flags.js", label: "Flags onboarding" },
  { file: "migrate-registration-fields.js", label: "Champs inscription" },
  { file: "migrate-product-is-visible.js", label: "Visibilité plats menu public" },
  { file: "migrate-admin-notifications.js", label: "Notifications admin" },
  { file: "migrate-admin-notifications-group.js", label: "Notifications admin (regroupement)" },
  { file: "migrate-performance-indexes.js", label: "Index performance" },
  { file: "migrate-upload-registry.js", label: "Registre upload_files (quota images)" },
  { file: "migrate-setup-assistance-requests.js", label: "Demandes d'assistance installation" },
  { file: "migrate-setup-assistance-crm.js", label: "CRM demandes d'installation" },
];

function runMigration(entry) {
  var scriptPath = path.join(__dirname, entry.file);
  return new Promise(function (resolve, reject) {
    console.log("\n[migrate-all] → " + entry.file + " — " + entry.label);
    var child = childProcess.spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", function (code) {
      if (code !== 0) {
        return reject(new Error(entry.file + " a échoué (code " + code + ")."));
      }
      resolve();
    });
  });
}

async function main() {
  if (!process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error("DB_NAME et DB_USER requis dans backend/.env");
  }

  console.log("[migrate-all] Base cible : " + process.env.DB_NAME);
  console.log("[migrate-all] " + migrations.length + " migration(s) à appliquer…");

  for (var i = 0; i < migrations.length; i += 1) {
    await runMigration(migrations[i]);
  }

  console.log("\n[migrate-all] Terminé — toutes les migrations incrémentielles sont à jour.");
}

main().catch(function (err) {
  console.error("\n[migrate-all] Échec :", err.message || err);
  process.exit(1);
});
