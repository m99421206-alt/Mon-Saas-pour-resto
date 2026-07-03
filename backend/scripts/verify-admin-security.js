/**
 * Vérification ciblée — sécurité ADMIN_EMAILS / routes /api/admin/*
 * Usage : node scripts/verify-admin-security.js
 */

"use strict";

var assert = require("assert");
var path = require("path");

function runUnitTests() {
  var savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  };

  try {
    delete require.cache[require.resolve("../src/utils/platformAdmin")];
    var platformAdmin = require("../src/utils/platformAdmin");

    process.env.ADMIN_EMAILS = "";
    process.env.NODE_ENV = "development";
    assert.strictEqual(platformAdmin.isPlatformAdminEmail("anyone@test.com"), false);
    assert.deepStrictEqual(platformAdmin.parseAdminEmailAllowlist(), []);

    process.env.ADMIN_EMAILS = "Admin@Example.com, other@test.com ";
    assert.strictEqual(platformAdmin.isPlatformAdminEmail("admin@example.com"), true);
    assert.strictEqual(platformAdmin.isPlatformAdminEmail("other@test.com"), true);
    assert.strictEqual(platformAdmin.isPlatformAdminEmail("notadmin@test.com"), false);

    process.env.NODE_ENV = "production";
    process.env.ADMIN_EMAILS = "";
    var prodStartupFailed = false;
    try {
      platformAdmin.validateAdminEmailsAtStartup();
    } catch (err) {
      prodStartupFailed = true;
      assert.match(String(err.message), /ADMIN_EMAILS/i);
    }
    assert.strictEqual(prodStartupFailed, true, "production doit refuser le démarrage si ADMIN_EMAILS vide");

    process.env.ADMIN_EMAILS = "admin@test.com";
    platformAdmin.validateAdminEmailsAtStartup();

    console.log("[verify-admin-security] Tests unitaires : OK");
  } finally {
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    process.env.ADMIN_EMAILS = savedEnv.ADMIN_EMAILS;
    delete require.cache[require.resolve("../src/utils/platformAdmin")];
  }
}

async function runMiddlewareTest() {
  var savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  };

  try {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_EMAILS = "admin-only@test.com";

    delete require.cache[require.resolve("../src/middlewares/adminMiddleware")];
    delete require.cache[require.resolve("../src/utils/platformAdmin")];

    var requirePlatformAdmin = require("../src/middlewares/adminMiddleware");
    var getPool = require("../src/config/database").getPool;

    var pool = getPool();
    var [users] = await pool.query(
      "SELECT id, email FROM users WHERE LOWER(email) NOT IN (?) ORDER BY id ASC LIMIT 1",
      [["admin-only@test.com"]],
    );

    if (!users.length) {
      console.log("[verify-admin-security] Test middleware : ignoré (aucun utilisateur non-admin en base)");
      return;
    }

    var req = {
      user: { id: users[0].id },
      originalUrl: "/api/admin/stats",
      headers: {},
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    };

    var statusCode = null;
    var body = null;
    var nextCalled = false;

    var res = {
      status: function (code) {
        statusCode = code;
        return this;
      },
      json: function (payload) {
        body = payload;
        return this;
      },
    };

    await requirePlatformAdmin(req, res, function () {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, "next() ne doit pas être appelé pour un non-admin");
    assert.strictEqual(statusCode, 403, "un non-admin doit recevoir HTTP 403");
    assert.ok(body && body.message, "réponse JSON attendue");

    console.log(
      "[verify-admin-security] Test middleware non-admin (" +
        users[0].email +
        ") : HTTP " +
        statusCode +
        " — OK",
    );
  } finally {
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    process.env.ADMIN_EMAILS = savedEnv.ADMIN_EMAILS;
    delete require.cache[require.resolve("../src/middlewares/adminMiddleware")];
    delete require.cache[require.resolve("../src/utils/platformAdmin")];
  }
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "../.env") });
  runUnitTests();
  await runMiddlewareTest();
  console.log("[verify-admin-security] Tous les tests passés.");
}

main().catch(function (err) {
  console.error("[verify-admin-security] ÉCHEC :", err.message || err);
  process.exit(1);
});
