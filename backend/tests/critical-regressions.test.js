const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const ROOT = path.join(__dirname, "..");

function fakeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    sent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.sent = true;
      return this;
    },
    send(body) {
      this.body = body;
      this.sent = true;
      return this;
    },
  };
}

function loadWithMocks(targetRelativePath, mocks) {
  var targetPath = require.resolve(path.join(ROOT, targetRelativePath));
  var saved = new Map();

  Object.keys(mocks).forEach(function (relativePath) {
    var resolved = require.resolve(path.join(ROOT, relativePath));
    saved.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mocks[relativePath],
    };
  });

  saved.set(targetPath, require.cache[targetPath]);
  delete require.cache[targetPath];

  try {
    return {
      module: require(targetPath),
      restore() {
        saved.forEach(function (entry, resolved) {
          if (entry) {
            require.cache[resolved] = entry;
          } else {
            delete require.cache[resolved];
          }
        });
      },
    };
  } catch (err) {
    saved.forEach(function (entry, resolved) {
      if (entry) {
        require.cache[resolved] = entry;
      } else {
        delete require.cache[resolved];
      }
    });
    throw err;
  }
}

test("login lockout ignores spoofed X-Forwarded-For values", function () {
  const loginLockout = require("../src/utils/loginLockout");
  const req = {
    headers: { "x-forwarded-for": "198.51.100.1, 198.51.100.2" },
    ip: "198.51.100.1",
    socket: { remoteAddress: "203.0.113.55" },
  };

  assert.equal(loginLockout.getClientIp(req), "203.0.113.55");
});

test("JWT auth rejects an already-issued token after account suspension", async function () {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret";

  const loaded = loadWithMocks("src/middlewares/authMiddleware.js", {
    "src/config/database.js": {
      getPool() {
        return {
          async query(sql, params) {
            assert.match(sql, /account_status/);
            assert.deepEqual(params, [42]);
            return [[{ id: 42, account_status: "suspended" }]];
          },
        };
      },
    },
  });

  try {
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
    const res = fakeResponse();
    var nextCalled = false;

    await loaded.module(
      { headers: { authorization: "Bearer " + token } },
      res,
      function () {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /suspendu/);
  } finally {
    loaded.restore();
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test("admin middleware fails closed when ADMIN_EMAILS is empty", async function () {
  const previousAdminEmails = process.env.ADMIN_EMAILS;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.ADMIN_EMAILS = "";
  process.env.NODE_ENV = "development";

  const loaded = loadWithMocks("src/middlewares/adminMiddleware.js", {
    "src/config/database.js": {
      getPool() {
        return {
          async query(sql, params) {
            assert.match(sql, /SELECT email/);
            assert.deepEqual(params, [7]);
            return [[{ email: "owner@example.com" }]];
          },
        };
      },
    },
  });

  try {
    const res = fakeResponse();
    var nextCalled = false;

    await loaded.module({ user: { id: 7 } }, res, function () {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.match(res.body.message, /ADMIN_EMAILS/);
  } finally {
    loaded.restore();
    if (previousAdminEmails === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = previousAdminEmails;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("category delete refuses to cascade-delete existing products", async function () {
  const queries = [];
  const loaded = loadWithMocks("src/controllers/categoryController.js", {
    "src/config/database.js": {
      getPool() {
        return {
          async query(sql) {
            queries.push(sql);
            if (/SELECT name FROM categories/.test(sql)) {
              return [[{ name: "Grillades" }]];
            }
            if (/COUNT\(\*\) AS total FROM products/.test(sql)) {
              return [[{ total: 3 }]];
            }
            throw new Error("Unexpected query: " + sql);
          },
        };
      },
    },
    "src/utils/restaurantOwnership.js": {
      async assertCategoryOwnedByRestaurant() {
        return "ok";
      },
      sendForbidden(res) {
        return res.status(403).json({ message: "Accès refusé." });
      },
    },
    "src/utils/auditLog.js": {
      AUDIT_ACTIONS: { CATEGORY_DELETE: "CATEGORY_DELETE" },
      async appendAudit() {
        throw new Error("Audit should not run when deletion is blocked.");
      },
    },
  });

  try {
    const res = fakeResponse();
    await loaded.module.deleteCategory(
      { params: { id: "12" }, restaurantId: 4, user: { id: 9 } },
      res,
    );

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /contient 3 plat/);
    assert.equal(queries.some(function (sql) {
      return /^DELETE FROM categories/.test(sql);
    }), false);
  } finally {
    loaded.restore();
  }
});

test("restore prepares an empty uploads snapshot and replaces stale files", async function () {
  const restore = require("../scripts/restore-backup");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "menugo-restore-test-"));
  const fakeBackendRoot = path.join(tempRoot, "backend");
  const fakeBackupRoot = path.join(tempRoot, "backup");
  const fakeUploadsRoot = path.join(fakeBackendRoot, "uploads");

  await fs.mkdir(fakeUploadsRoot, { recursive: true });
  await fs.mkdir(fakeBackupRoot, { recursive: true });
  await fs.writeFile(path.join(fakeUploadsRoot, "stale.jpg"), "stale", "utf8");

  try {
    const prepared = await restore.prepareUploadsRestore(fakeBackupRoot, null, fakeBackendRoot);
    assert.deepEqual(await fs.readdir(prepared.uploadsDir), []);

    await restore.replaceUploadsDirectory(prepared, fakeBackendRoot);

    assert.deepEqual(await fs.readdir(fakeUploadsRoot), []);
    assert.equal(fsSync.existsSync(prepared.tempRoot), false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("restore rejects a missing uploads archive before callers import SQL", async function () {
  const restore = require("../scripts/restore-backup");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "menugo-restore-test-"));
  const fakeBackendRoot = path.join(tempRoot, "backend");
  const fakeBackupRoot = path.join(tempRoot, "backup");
  const fakeUploadsRoot = path.join(fakeBackendRoot, "uploads");

  await fs.mkdir(fakeUploadsRoot, { recursive: true });
  await fs.mkdir(fakeBackupRoot, { recursive: true });
  await fs.writeFile(path.join(fakeUploadsRoot, "current.jpg"), "current", "utf8");

  try {
    await assert.rejects(
      restore.prepareUploadsRestore(fakeBackupRoot, "uploads.tar.gz", fakeBackendRoot),
      /Archive uploads introuvable/,
    );
    assert.equal(fsSync.existsSync(path.join(fakeUploadsRoot, "current.jpg")), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
