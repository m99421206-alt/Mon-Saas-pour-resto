const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promisify } = require("node:util");
const zlib = require("node:zlib");

const { gzipFile } = require("../scripts/backup");
const gunzip = promisify(zlib.gunzip);

test("gzipFile writes compressed SQL and removes plaintext on success", async function () {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "menugo-backup-test-"));
  const sqlPath = path.join(tempDir, "database.sql");
  const gzipPath = path.join(tempDir, "database.sql.gz");
  const sql = "CREATE TABLE users (id INT);\n";

  await fs.writeFile(sqlPath, sql, "utf8");

  await gzipFile(sqlPath, gzipPath);

  await assert.rejects(fs.access(sqlPath), { code: "ENOENT" });
  const restored = await gunzip(await fs.readFile(gzipPath));
  assert.equal(restored.toString("utf8"), sql);
});

test("gzipFile removes plaintext SQL when compression fails", async function () {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "menugo-backup-test-"));
  const sqlPath = path.join(tempDir, "database.sql");
  const gzipPath = path.join(tempDir, "missing", "database.sql.gz");

  await fs.writeFile(sqlPath, "CREATE TABLE users (id INT);\n", "utf8");

  await assert.rejects(gzipFile(sqlPath, gzipPath));
  await assert.rejects(fs.access(sqlPath), { code: "ENOENT" });
  await assert.rejects(fs.access(gzipPath + ".tmp"), { code: "ENOENT" });
});
