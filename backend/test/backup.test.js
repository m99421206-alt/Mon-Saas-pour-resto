const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { gzipFile } = require("../scripts/backup");

test("gzipFile removes plaintext SQL when compression fails", async function () {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "menugo-backup-test-"));
  const sqlPath = path.join(tempDir, "database.sql");
  const gzipPath = path.join(tempDir, "missing", "database.sql.gz");

  await fs.writeFile(sqlPath, "CREATE TABLE users (id INT);\n", "utf8");

  await assert.rejects(gzipFile(sqlPath, gzipPath));
  await assert.rejects(fs.access(sqlPath), { code: "ENOENT" });
  await assert.rejects(fs.access(gzipPath + ".tmp"), { code: "ENOENT" });
});
