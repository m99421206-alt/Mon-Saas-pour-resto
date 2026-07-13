const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function parseArgs() {
  var raw = process.argv.slice(2);
  var result = {};
  raw.forEach(function (arg) {
    if (!arg || arg.indexOf("=") === -1) {
      return;
    }
    var parts = arg.split("=");
    var key = parts.shift().replace(/^--/, "");
    var value = parts.join("=");
    result[key] = value;
  });
  return result;
}

function showUsage() {
  console.log(
    'Usage: node create-first-admin.js --email=admin@example.com --password=MySecret123 [--fullName="Admin Name"] [--phone=123456789]',
  );
  console.log("");
  console.log(
    "Les variables DB_* et ADMIN_EMAILS doivent être configurées dans backend/.env.",
  );
  console.log(
    "Si l'email fourni ne figure pas dans ADMIN_EMAILS, le compte sera créé mais ne sera pas reconnu comme administrateur plateforme.",
  );
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function getFirstAdminEmail(raw) {
  if (!raw) return null;
  return (
    raw
      .split(",")
      .map(function (item) {
        return String(item || "")
          .trim()
          .toLowerCase();
      })
      .filter(Boolean)[0] || null
  );
}

async function main() {
  var args = parseArgs();

  var email = normalizeEmail(args.email || args.e);
  var password = args.password || args.p;
  var fullName = args.fullName || args.name || "Administrator";
  var phone = args.phone || args.telephone || null;

  if (!email || !password) {
    showUsage();
    process.exit(1);
  }

  var adminEmailsRaw = process.env.ADMIN_EMAILS || "";
  var normalizedAdminEmails = adminEmailsRaw
    .split(",")
    .map(function (item) {
      return String(item || "")
        .trim()
        .toLowerCase();
    })
    .filter(Boolean);

  if (
    normalizedAdminEmails.length &&
    normalizedAdminEmails.indexOf(email) === -1
  ) {
    console.warn(
      "Attention : l'adresse email fournie n'est pas listée dans ADMIN_EMAILS de backend/.env.",
    );
    console.warn(
      "Pour qu'elle soit reconnue comme administration plateforme, ajoutez-la à ADMIN_EMAILS ou changez l'email.",
    );
  } else if (!normalizedAdminEmails.length) {
    console.warn(
      "ADMIN_EMAILS n'est pas configuré dans backend/.env. Vérifiez la configuration.",
    );
  }

  var dbHost = process.env.DB_HOST || "127.0.0.1";
  var dbUser = process.env.DB_USER;
  var dbPassword =
    process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
  var dbName = process.env.DB_NAME;

  if (!dbUser || !dbName) {
    console.error(
      "Erreur : DB_USER et DB_NAME doivent être définis dans backend/.env.",
    );
    process.exit(1);
  }

  var saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
  var passwordHash = await bcrypt.hash(password, saltRounds);

  var connection = await mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  try {
    var [existing] = await connection.query(
      "SELECT id, email FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    if (existing && existing.length) {
      console.error("Un utilisateur avec cet email existe déjà :", email);
      process.exit(1);
    }

    var [result] = await connection.query(
      "INSERT INTO users (email, full_name, phone, password, account_status) VALUES (?, ?, ?, ?, 'active')",
      [email, fullName, phone, passwordHash],
    );

    console.log("Compte administrateur créé avec succès.");
    console.log("ID utilisateur :", result.insertId);
    console.log("Email :", email);
    console.log("Mot de passe hashé stocké dans la colonne users.password.");

    if (normalizedAdminEmails.indexOf(email) === -1) {
      console.log("");
      console.log(
        "Note : cet email n'est pas dans ADMIN_EMAILS. Ajoutez-le dans backend/.env pour les routes admin.",
      );
    }
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(
    "Erreur lors de la création du compte administrateur :",
    err.message || err,
  );
  process.exit(1);
});
