/**
 * Pool de connexions MySQL (mysql2 / mode promesses)
 * Les variables DB_* doivent être définies dans .env (voir .env.example).
 * dotenv doit être chargé avant tout require() de ce module (déjà le cas dans server.js).
 */

const mysql = require("mysql2/promise");

/** @type {import("mysql2/promise").Pool | null} */
var pool = null;

/**
 * Retourne le pool singleton (créé au premier appel).
 * @returns {import("mysql2/promise").Pool}
 */
function getPool() {
  if (pool) {
    return pool;
  }

  var host = process.env.DB_HOST || "127.0.0.1";
  var user = process.env.DB_USER;
  var password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
  var database = process.env.DB_NAME;

  if (!user || !database) {
    throw new Error(
      "MySQL : renseignez DB_USER et DB_NAME dans le fichier .env (copiez .env.example)."
    );
  }

  pool = mysql.createPool({
    host: host,
    user: user,
    password: password,
    database: database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  return pool;
}

/**
 * Vérifie que la base répond (utile pour /health ou tests).
 * @returns {Promise<{ ok: number }>}
 */
async function ping() {
  var p = getPool();
  var [rows] = await p.query("SELECT 1 AS ok");
  return rows[0];
}

module.exports = {
  getPool: getPool,
  ping: ping,
};
