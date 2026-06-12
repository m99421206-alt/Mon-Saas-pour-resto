const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { resolveBackupFile, restoreUploads } = require("../scripts/restore-backup");

test("resolveBackupFile keeps manifest filenames inside the backup folder", function (t) {
  const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), "menugo-backup-path-"));
  t.after(function () {
    fs.rmSync(backupFolder, { recursive: true, force: true });
  });

  assert.equal(
    resolveBackupFile(backupFolder, "database.sql.gz", "fallback.sql.gz", "Fichier SQL"),
    path.join(backupFolder, "database.sql.gz"),
  );
  assert.equal(
    resolveBackupFile(backupFolder, "", "fallback.sql.gz", "Fichier SQL"),
    path.join(backupFolder, "fallback.sql.gz"),
  );
});

test("resolveBackupFile rejects manifest path traversal", function () {
  const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), "menugo-backup-path-"));
  try {
    assert.throws(
      function () {
        resolveBackupFile(backupFolder, "../evil.sql.gz", "database.sql.gz", "Fichier SQL");
      },
      /Fichier SQL invalide/,
    );
    assert.throws(
      function () {
        resolveBackupFile(backupFolder, "/tmp/evil.sql.gz", "database.sql.gz", "Fichier SQL");
      },
      /Fichier SQL invalide/,
    );
    assert.throws(
      function () {
        resolveBackupFile(backupFolder, "nested/uploads.tar.gz", null, "Archive uploads");
      },
      /Archive uploads invalide/,
    );
  } finally {
    fs.rmSync(backupFolder, { recursive: true, force: true });
  }
});

test("restoreUploads rejects manifest archive paths outside the backup folder", async function () {
  const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), "menugo-backup-path-"));
  try {
    await assert.rejects(
      function () {
        return restoreUploads(backupFolder, "../uploads.tar.gz");
      },
      /Archive uploads invalide/,
    );
  } finally {
    fs.rmSync(backupFolder, { recursive: true, force: true });
  }
});
