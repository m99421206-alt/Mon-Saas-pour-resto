/**
 * Vérifie le rate limit uploads (utilisateur + IP) sans Multer/DB.
 * Usage : NODE_ENV=production node scripts/verify-upload-rate-limit.js
 */

process.env.NODE_ENV = "production";

const express = require("express");
const http = require("http");

function loadLimiters() {
  var modPath = require.resolve("../src/middlewares/uploadRateLimit");
  delete require.cache[modPath];
  return require("../src/middlewares/uploadRateLimit").buildUploadRateLimiters();
}

function requestJson(port, userId) {
  return new Promise(function (resolve, reject) {
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: "/test-upload",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User": String(userId),
        },
      },
      function (res) {
        var body = "";
        res.on("data", function (chunk) {
          body += chunk;
        });
        res.on("end", function () {
          var data = {};
          try {
            data = body ? JSON.parse(body) : {};
          } catch (err) {
            data = { raw: body };
          }
          resolve({ status: res.statusCode, data: data });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function createApp(limiters) {
  var app = express();
  app.set("trust proxy", 1);

  app.use(limiters.uploadIpRateLimiter);
  app.use(function (req, res, next) {
    var uid = Number(req.headers["x-test-user"]);
    req.user = { id: Number.isInteger(uid) && uid > 0 ? uid : 1 };
    next();
  });
  app.post("/test-upload", limiters.uploadUserRateLimiter, function (req, res) {
    res.status(201).json({ ok: true });
  });

  return app;
}

async function runCase(name, fn) {
  try {
    await fn();
    console.log("OK  " + name);
    return true;
  } catch (err) {
    console.error("FAIL " + name + " — " + (err.message || err));
    return false;
  }
}

async function main() {
  var limiters = loadLimiters();
  console.log(
    "Limites (production) — utilisateur: " +
      limiters.UPLOAD_USER_MAX +
      " / " +
      limiters.UPLOAD_RATE_WINDOW_MS / 60000 +
      " min, IP: " +
      limiters.UPLOAD_IP_MAX +
      " / " +
      limiters.UPLOAD_RATE_WINDOW_MS / 60000 +
      " min"
  );

  var passed = 0;
  var total = 0;

  total++;
  if (
    await runCase("10 uploads utilisateur → 201", async function () {
      var app = createApp(loadLimiters());
      var server = app.listen(0);
      var port = server.address().port;
      try {
        for (var i = 0; i < 10; i++) {
          var r = await requestJson(port, 9001);
          if (r.status !== 201) {
            throw new Error("requête " + (i + 1) + " → HTTP " + r.status);
          }
        }
      } finally {
        server.close();
      }
    })
  ) {
    passed++;
  }

  total++;
  if (
    await runCase("11e upload utilisateur → 429 JSON", async function () {
      var app = createApp(loadLimiters());
      var server = app.listen(0);
      var port = server.address().port;
      try {
        for (var i = 0; i < 10; i++) {
          await requestJson(port, 9002);
        }
        var blocked = await requestJson(port, 9002);
        if (blocked.status !== 429) {
          throw new Error("attendu 429, reçu " + blocked.status);
        }
        if (!blocked.data || blocked.data.error !== limiters.UPLOAD_RATE_LIMIT_MESSAGE) {
          throw new Error("JSON error attendu, reçu " + JSON.stringify(blocked.data));
        }
      } finally {
        server.close();
      }
    })
  ) {
    passed++;
  }

  total++;
  if (
    await runCase("Utilisateur distinct non bloqué (même IP)", async function () {
      var app = createApp(loadLimiters());
      var server = app.listen(0);
      var port = server.address().port;
      try {
        for (var i = 0; i < 10; i++) {
          await requestJson(port, 9101);
        }
        var other = await requestJson(port, 9102);
        if (other.status !== 201) {
          throw new Error("autre utilisateur bloqué trop tôt → HTTP " + other.status);
        }
      } finally {
        server.close();
      }
    })
  ) {
    passed++;
  }

  total++;
  if (
    await runCase("Limite IP (30 requêtes cumulées) → 429", async function () {
      var app = createApp(loadLimiters());
      var server = app.listen(0);
      var port = server.address().port;
      try {
        for (var u = 0; u < 30; u++) {
          var r = await requestJson(port, 9200 + u);
          if (r.status !== 201) {
            throw new Error("user " + (9200 + u) + " → HTTP " + r.status);
          }
        }
        var blocked = await requestJson(port, 9999);
        if (blocked.status !== 429) {
          throw new Error("attendu 429 IP, reçu " + blocked.status);
        }
      } finally {
        server.close();
      }
    })
  ) {
    passed++;
  }

  total++;
  if (
    await runCase("Nouvelle fenêtre après expiration", async function () {
      var savedWindow = limiters.UPLOAD_RATE_WINDOW_MS;
      var modPath = require.resolve("../src/middlewares/uploadRateLimit");
      delete require.cache[modPath];

      var rateLimit = require("express-rate-limit");
      var shortWindowMs = 200;
      var shortHandler = function (req, res, next, options) {
        res.status(429).json({ error: limiters.UPLOAD_RATE_LIMIT_MESSAGE });
      };
      var shortUserLimiter = rateLimit({
        windowMs: shortWindowMs,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        statusCode: 429,
        handler: shortHandler,
        keyGenerator: function (req) {
          return "upload:user:" + (req.user && req.user.id ? req.user.id : "anon");
        },
      });

      var app = express();
      app.use(function (req, res, next) {
        req.user = { id: 8801 };
        next();
      });
      app.post("/test-upload", shortUserLimiter, function (req, res) {
        res.status(201).json({ ok: true });
      });

      var server = app.listen(0);
      var port = server.address().port;
      try {
        await requestJson(port, 8801);
        await requestJson(port, 8801);
        var blocked = await requestJson(port, 8801);
        if (blocked.status !== 429) {
          throw new Error("3e requête devrait être 429");
        }
        await new Promise(function (r) {
          setTimeout(r, shortWindowMs + 80);
        });
        var again = await requestJson(port, 8801);
        if (again.status !== 201) {
          throw new Error("après fenêtre, attendu 201, reçu " + again.status);
        }
      } finally {
        server.close();
      }
    })
  ) {
    passed++;
  }

  console.log("\nRésultat : " + passed + "/" + total);
  if (passed !== total) {
    process.exit(1);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
