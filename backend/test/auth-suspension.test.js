const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const srcRoot = path.resolve(__dirname, "../src");

function createJsonResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    set: function (name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (payload) {
      this.body = payload;
      return this;
    },
  };
}

function installDbMock(pool) {
  const dbPath = require.resolve(path.join(srcRoot, "config/database"));
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      getPool: function () {
        return pool;
      },
      ping: async function () {
        return { ok: 1 };
      },
    },
  };
}

function loadFresh(relativeModule, pool) {
  installDbMock(pool);
  const modulePath = require.resolve(path.join(srcRoot, relativeModule));
  delete require.cache[modulePath];
  return require(modulePath);
}

test("requireAuth rejects existing JWTs for suspended accounts", async function () {
  process.env.JWT_SECRET = "test-secret";
  const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
  let nextCalled = false;

  const requireAuth = loadFresh("middlewares/authMiddleware", {
    query: async function (sql, params) {
      assert.match(sql, /account_status/);
      assert.deepEqual(params, [42]);
      return [[{ id: 42, account_status: " suspended " }]];
    },
  });

  const req = { headers: { authorization: "Bearer " + token } };
  const res = createJsonResponse();

  await requireAuth(req, res, function (err) {
    assert.ifError(err);
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    message: "Ce compte a été suspendu. Contactez l'administrateur.",
  });
  assert.equal(req.user, undefined);
});

test("requireAuth accepts existing JWTs for active accounts", async function () {
  process.env.JWT_SECRET = "test-secret";
  const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET);
  let nextCalled = false;

  const requireAuth = loadFresh("middlewares/authMiddleware", {
    query: async function (sql, params) {
      assert.match(sql, /account_status/);
      assert.deepEqual(params, [7]);
      return [[{ id: 7, account_status: "active" }]];
    },
  });

  const req = { headers: { authorization: "Bearer " + token } };
  const res = createJsonResponse();

  await requireAuth(req, res, function (err) {
    assert.ifError(err);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { id: 7 });
  assert.equal(res.body, undefined);
});

test("login uses the generic credential failure for suspended accounts", async function () {
  const email = "owner@example.com";
  const password = "correct-password";
  const hash = bcrypt.hashSync(password, 4);
  let restaurantQueryReached = false;

  const authController = loadFresh("controllers/authController", {
    query: async function (sql, params) {
      if (/FROM users WHERE email/.test(sql)) {
        assert.deepEqual(params, [email]);
        return [
          [
            {
              id: 11,
              email: email,
              full_name: "Owner",
              phone: null,
              password: hash,
              account_status: "suspended",
            },
          ],
        ];
      }

      if (/FROM restaurants/.test(sql)) {
        restaurantQueryReached = true;
      }
      throw new Error("Unexpected query: " + sql);
    },
  });

  const loginLockoutPath = require.resolve(path.join(srcRoot, "utils/loginLockout"));
  const loginLockout = require(loginLockoutPath);
  const originals = {
    getClientIp: loginLockout.getClientIp,
    checkLockout: loginLockout.checkLockout,
    recordFailure: loginLockout.recordFailure,
    recordSuccess: loginLockout.recordSuccess,
  };
  let failures = 0;
  let successes = 0;

  loginLockout.getClientIp = function () {
    return "203.0.113.10";
  };
  loginLockout.checkLockout = function () {
    return { allowed: true };
  };
  loginLockout.recordFailure = function (lockedEmail, ip) {
    assert.equal(lockedEmail, email);
    assert.equal(ip, "203.0.113.10");
    failures += 1;
    return { allowed: true };
  };
  loginLockout.recordSuccess = function () {
    successes += 1;
  };

  try {
    const req = { body: { email: " OWNER@example.com ", password: password }, headers: {} };
    const res = createJsonResponse();

    await authController.login(req, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: "Email ou mot de passe incorrect." });
    assert.equal(failures, 1);
    assert.equal(successes, 0);
    assert.equal(restaurantQueryReached, false);
  } finally {
    loginLockout.getClientIp = originals.getClientIp;
    loginLockout.checkLockout = originals.checkLockout;
    loginLockout.recordFailure = originals.recordFailure;
    loginLockout.recordSuccess = originals.recordSuccess;
  }
});
