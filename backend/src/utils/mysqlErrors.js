/**
 * Détection des pannes MySQL / connexion indisponible.
 */

var DB_UNAVAILABLE_MESSAGE =
  "Service temporairement indisponible (base de données). Réessayez dans quelques instants.";

var MYSQL_UNAVAILABLE_CODES = {
  ECONNREFUSED: true,
  ETIMEDOUT: true,
  ENOTFOUND: true,
  ECONNRESET: true,
  EHOSTUNREACH: true,
  ENETUNREACH: true,
  PROTOCOL_CONNECTION_LOST: true,
  PROTOCOL_ENQUEUE_AFTER_QUIT: true,
  ER_CON_COUNT_ERROR: true,
};

function isMysqlUnavailableError(err) {
  if (!err) {
    return false;
  }
  var code = String(err.code || "");
  if (MYSQL_UNAVAILABLE_CODES[code]) {
    return true;
  }
  if (err.fatal === true && code.indexOf("PROTOCOL_") === 0) {
    return true;
  }
  return false;
}

function mysqlUnavailablePayload() {
  return {
    message: DB_UNAVAILABLE_MESSAGE,
    code: "db_unavailable",
  };
}

function sendMysqlUnavailableResponse(res) {
  return res.status(503).json(mysqlUnavailablePayload());
}

module.exports = {
  DB_UNAVAILABLE_MESSAGE: DB_UNAVAILABLE_MESSAGE,
  isMysqlUnavailableError: isMysqlUnavailableError,
  mysqlUnavailablePayload: mysqlUnavailablePayload,
  sendMysqlUnavailableResponse: sendMysqlUnavailableResponse,
};
