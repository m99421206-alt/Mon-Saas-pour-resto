const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "../src/config/database.js");
const authMiddlewarePath = path.join(__dirname, "../src/middlewares/authMiddleware.js");
const adminMiddlewarePath = path.join(__dirname, "../src/middlewares/adminMiddleware.js");

function mockDatabase(pool) {
  var resolved = require.resolve(databasePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: {
      getPool: function () {
        return pool;
      },
    },
  };
}

function loadMiddleware(modulePath, pool) {
  mockDatabase(pool);
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(middleware, req, res) {
  var nextCalled = false;
  var nextErr = null;
  await middleware(req, res, function (err) {
    nextCalled = true;
    nextErr = err || null;
  });
  return { nextCalled: nextCalled, nextErr: nextErr };
}

function signUserToken(userId) {
  return jwt.sign({ userId: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

test("requireAuth rejects a suspended account even with a valid JWT", async function () {
  process.env.JWT_SECRET = "test-secret";
  var pool = {
    query: async function () {
      return [[{ id: 7, account_status: "suspended" }]];
    },
  };
  var requireAuth = loadMiddleware(authMiddlewarePath, pool);
  var req = { headers: { authorization: "Bearer " + signUserToken(7) } };
  var res = makeRes();

  var result = await invoke(requireAuth, req, res);

  assert.equal(result.nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /suspendu/);
  assert.equal(req.user, undefined);
});

test("requireAuth accepts an active account and attaches the user id", async function () {
  process.env.JWT_SECRET = "test-secret";
  var seenParams = null;
  var pool = {
    query: async function (_sql, params) {
      seenParams = params;
      return [[{ id: 7, account_status: "active" }]];
    },
  };
  var requireAuth = loadMiddleware(authMiddlewarePath, pool);
  var req = { headers: { authorization: "Bearer " + signUserToken(7) } };
  var res = makeRes();

  var result = await invoke(requireAuth, req, res);

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextErr, null);
  assert.deepEqual(seenParams, [7]);
  assert.deepEqual(req.user, { id: 7 });
});

test("requireAuth rejects a token for a deleted user", async function () {
  process.env.JWT_SECRET = "test-secret";
  var pool = {
    query: async function () {
      return [[]];
    },
  };
  var requireAuth = loadMiddleware(authMiddlewarePath, pool);
  var req = { headers: { authorization: "Bearer " + signUserToken(99) } };
  var res = makeRes();

  var result = await invoke(requireAuth, req, res);

  assert.equal(result.nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(req.user, undefined);
});

test("requirePlatformAdmin denies access when ADMIN_EMAILS is empty", async function () {
  process.env.ADMIN_EMAILS = "";
  var pool = {
    query: async function () {
      return [[{ email: "owner@example.com" }]];
    },
  };
  var requirePlatformAdmin = loadMiddleware(adminMiddlewarePath, pool);
  var req = { user: { id: 7 } };
  var res = makeRes();

  var result = await invoke(requirePlatformAdmin, req, res);

  assert.equal(result.nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /non configur/);
});

test("requirePlatformAdmin allows only configured admin emails", async function () {
  process.env.ADMIN_EMAILS = "admin@example.com, second@example.com";
  var pool = {
    query: async function () {
      return [[{ email: " Admin@Example.com " }]];
    },
  };
  var requirePlatformAdmin = loadMiddleware(adminMiddlewarePath, pool);
  var req = { user: { id: 7 } };
  var res = makeRes();

  var result = await invoke(requirePlatformAdmin, req, res);

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextErr, null);
});

test("requirePlatformAdmin rejects emails outside ADMIN_EMAILS", async function () {
  process.env.ADMIN_EMAILS = "admin@example.com";
  var pool = {
    query: async function () {
      return [[{ email: "owner@example.com" }]];
    },
  };
  var requirePlatformAdmin = loadMiddleware(adminMiddlewarePath, pool);
  var req = { user: { id: 7 } };
  var res = makeRes();

  var result = await invoke(requirePlatformAdmin, req, res);

  assert.equal(result.nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /réservé/);
});
