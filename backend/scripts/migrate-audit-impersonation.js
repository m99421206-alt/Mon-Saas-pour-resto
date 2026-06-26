/**
 * Ajoute les colonnes d'audit impersonation sur audit_logs (rétrocompatible).
 * Usage (depuis backend/) : npm run db:audit-impersonation
 */

require("dotenv").config();

var mysql = require("mysql2/promise");

async function columnExists(connection, database, table, column) {
  var [rows] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [database, table, column]
  );
  return rows.length > 0;
}

async function main() {
  var host = process.env.DB_HOST || "127.0.0.1";
  var user = process.env.DB_USER;
  var password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
  var database = process.env.DB_NAME;

  if (!user || !database) {
    throw new Error("Renseignez DB_USER et DB_NAME dans backend/.env");
  }

  var connection = await mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
  });

  if (!(await columnExists(connection, database, "audit_logs", "impersonation"))) {
    await connection.query(
      "ALTER TABLE audit_logs ADD COLUMN impersonation TINYINT(1) NOT NULL DEFAULT 0 AFTER detail"
    );
  }

  if (!(await columnExists(connection, database, "audit_logs", "subject_user_id"))) {
    await connection.query(
      "ALTER TABLE audit_logs ADD COLUMN subject_user_id INT UNSIGNED NULL AFTER impersonation"
    );
  }

  if (!(await columnExists(connection, database, "audit_logs", "actor_type"))) {
    await connection.query(
      "ALTER TABLE audit_logs ADD COLUMN actor_type VARCHAR(16) NULL AFTER subject_user_id"
    );
  }

  var [fkRows] = await connection.query(
    "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS " +
      "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_logs' AND CONSTRAINT_NAME = 'fk_audit_logs_subject_user' LIMIT 1",
    [database]
  );
  if (!fkRows.length && (await columnExists(connection, database, "audit_logs", "subject_user_id"))) {
    await connection.query(
      "ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_subject_user " +
        "FOREIGN KEY (subject_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE"
    );
  }

  var [idxRows] = await connection.query(
    "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS " +
      "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = 'idx_audit_logs_impersonation' LIMIT 1",
    [database]
  );
  if (!idxRows.length) {
    await connection.query(
      "ALTER TABLE audit_logs ADD KEY idx_audit_logs_impersonation (impersonation, created_at)"
    );
  }

  await connection.end();
  console.log("Colonnes audit impersonation vérifiées (impersonation, subject_user_id, actor_type).");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
