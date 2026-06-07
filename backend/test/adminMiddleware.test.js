const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const middlewarePath = path.join(__dirname, "../src/middlewares/adminMiddleware.js");
const databasePath = path.join(__dirname, "../src/config/database.js");

function loadMiddlewareWithEmail(email) {
  delete require.cache[require.resolve(middlewarePath)];
  require.cache[require.resolve(databasePath)] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: {
      getPool: function () {
        return {
          query: async function () {
            return [[{ email: email }]];
          },
        };
      },
    },
  };
  return require(middlewarePath);
}

function createResponse() {
  return {
    statusCode: null,
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

test.afterEach(function () {
  delete process.env.ADMIN_EMAILS;
  delete process.env.NODE_ENV;
  delete require.cache[require.resolve(middlewarePath)];
  delete require.cache[require.resolve(databasePath)];
});

test("requirePlatformAdmin fails closed when ADMIN_EMAILS is empty outside production", async function () {
  process.env.NODE_ENV = "development";
  process.env.ADMIN_EMAILS = "";
  const requirePlatformAdmin = loadMiddlewareWithEmail("owner@example.com");
  const res = createResponse();
  let nextCalled = false;

  await requirePlatformAdmin({ user: { id: 42 } }, res, function () {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.message, /ADMIN_EMAILS/);
});

test("requirePlatformAdmin allows emails present in ADMIN_EMAILS", async function () {
  process.env.ADMIN_EMAILS = "admin@example.com, other@example.com";
  const requirePlatformAdmin = loadMiddlewareWithEmail("ADMIN@example.com");
  const res = createResponse();
  let nextCalled = false;

  await requirePlatformAdmin({ user: { id: 1 } }, res, function () {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("requirePlatformAdmin denies authenticated users outside ADMIN_EMAILS", async function () {
  process.env.ADMIN_EMAILS = "admin@example.com";
  const requirePlatformAdmin = loadMiddlewareWithEmail("owner@example.com");
  const res = createResponse();
  let nextCalled = false;

  await requirePlatformAdmin({ user: { id: 2 } }, res, function () {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});
