process.env.LOGIN_MAX_ATTEMPTS = "2";

const assert = require("node:assert/strict");
const test = require("node:test");

const loginLockout = require("../src/utils/loginLockout");

function makeRequest(forwardedFor) {
  return {
    headers: {
      "x-forwarded-for": forwardedFor,
    },
    ip: "198.51.100.25",
    socket: {
      remoteAddress: "198.51.100.25",
    },
  };
}

test("getClientIp uses Express client IP instead of raw forwarded headers", function () {
  assert.equal(
    loginLockout.getClientIp(makeRequest("203.0.113.10")),
    "198.51.100.25"
  );
});

test("spoofed forwarded headers do not split the login lockout bucket", function () {
  const email = "lockout-spoof-test@example.com";
  const firstIp = loginLockout.getClientIp(makeRequest("203.0.113.10"));
  const secondIp = loginLockout.getClientIp(makeRequest("203.0.113.11"));

  assert.equal(firstIp, secondIp);
  assert.deepEqual(loginLockout.recordFailure(email, firstIp), { allowed: true });

  const locked = loginLockout.recordFailure(email, secondIp);
  assert.equal(locked.allowed, false);
  assert.equal(typeof locked.retryAfterSeconds, "number");
});
