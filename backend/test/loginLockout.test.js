const assert = require("node:assert/strict");
const test = require("node:test");

const loginLockout = require("../src/utils/loginLockout");

function makeRequest(ip, forwardedFor) {
  return {
    ip: ip,
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    socket: { remoteAddress: "198.51.100.5" },
  };
}

test("lockout key ignores spoofed x-forwarded-for values", function () {
  const email = "victim-" + Date.now() + "@example.com";
  const stableIp = "203.0.113.10";

  for (let i = 0; i < 5; i += 1) {
    const clientIp = loginLockout.getClientIp(makeRequest(stableIp, "10.0.0." + i));
    const result = loginLockout.recordFailure(email, clientIp);
    if (i < 4) {
      assert.equal(result.allowed, true);
    }
  }

  const lockCheck = loginLockout.checkLockout(email, stableIp);
  assert.equal(lockCheck.allowed, false);
  assert.equal(typeof lockCheck.retryAfterSeconds, "number");
});

test("client IP falls back to socket address when express IP is absent", function () {
  assert.equal(
    loginLockout.getClientIp({ headers: { "x-forwarded-for": "192.0.2.99" }, socket: { remoteAddress: "198.51.100.6" } }),
    "198.51.100.6",
  );
});
