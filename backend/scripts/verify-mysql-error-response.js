/**
 * Vérifie la détection des erreurs MySQL indisponible.
 * Usage : node scripts/verify-mysql-error-response.js
 */

"use strict";

var {
  isMysqlUnavailableError,
  mysqlUnavailablePayload,
} = require("../src/utils/mysqlErrors");

function assert(label, condition) {
  if (!condition) {
    throw new Error("FAIL " + label);
  }
  console.log("OK  " + label);
}

assert("ECONNREFUSED détecté", isMysqlUnavailableError({ code: "ECONNREFUSED" }));
assert("ETIMEDOUT détecté", isMysqlUnavailableError({ code: "ETIMEDOUT" }));
assert(
  "PROTOCOL_CONNECTION_LOST détecté",
  isMysqlUnavailableError({ code: "PROTOCOL_CONNECTION_LOST" })
);
assert("abc rejeté", !isMysqlUnavailableError({ code: "ER_DUP_ENTRY" }));
assert(
  "payload 503 cohérent",
  mysqlUnavailablePayload().code === "db_unavailable" &&
    typeof mysqlUnavailablePayload().message === "string"
);

console.log("\nRésultat : détection MySQL OK");
