const assert = require("assert/strict");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const { restoreUploads } = require("./restore-backup");

async function makeTempWorkspace() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "menugo-restore-test-"));
  return {
    root,
    backendRoot: path.join(root, "backend"),
    backupFolder: path.join(root, "backup"),
    uploadsDir: path.join(root, "backend", "uploads"),
  };
}

test("restoreUploads removes stale uploads when backup has no uploads archive", async function (t) {
  const dirs = await makeTempWorkspace();
  t.after(function () {
    fs.rmSync(dirs.root, { recursive: true, force: true });
  });

  await fs.promises.mkdir(dirs.uploadsDir, { recursive: true });
  await fs.promises.mkdir(dirs.backupFolder, { recursive: true });
  await fs.promises.writeFile(path.join(dirs.uploadsDir, "stale.jpg"), "old");

  await restoreUploads(dirs.backupFolder, null, {
    backendRoot: dirs.backendRoot,
    uploadsDir: dirs.uploadsDir,
  });

  assert.equal(fs.existsSync(dirs.uploadsDir), true);
  assert.deepEqual(await fs.promises.readdir(dirs.uploadsDir), []);
});

test("restoreUploads replaces uploads from a tar archive instead of merging stale files", async function (t) {
  const dirs = await makeTempWorkspace();
  t.after(function () {
    fs.rmSync(dirs.root, { recursive: true, force: true });
  });

  const sourceRoot = path.join(dirs.root, "source");
  await fs.promises.mkdir(path.join(sourceRoot, "uploads"), { recursive: true });
  await fs.promises.mkdir(dirs.backupFolder, { recursive: true });
  await fs.promises.mkdir(dirs.uploadsDir, { recursive: true });

  await fs.promises.writeFile(path.join(sourceRoot, "uploads", "restored.jpg"), "new");
  await fs.promises.writeFile(path.join(dirs.uploadsDir, "stale.jpg"), "old");

  const archivePath = path.join(dirs.backupFolder, "uploads.tar.gz");
  const result = childProcess.spawnSync("tar", ["-czf", archivePath, "-C", sourceRoot, "uploads"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  await restoreUploads(dirs.backupFolder, "uploads.tar.gz", {
    backendRoot: dirs.backendRoot,
    uploadsDir: dirs.uploadsDir,
  });

  assert.equal(await fs.promises.readFile(path.join(dirs.uploadsDir, "restored.jpg"), "utf8"), "new");
  assert.equal(fs.existsSync(path.join(dirs.uploadsDir, "stale.jpg")), false);
});

test("restoreUploads expands zip archives directly into uploads", async function (t) {
  const dirs = await makeTempWorkspace();
  t.after(function () {
    fs.rmSync(dirs.root, { recursive: true, force: true });
  });

  await fs.promises.mkdir(dirs.uploadsDir, { recursive: true });
  await fs.promises.mkdir(dirs.backupFolder, { recursive: true });
  await fs.promises.writeFile(path.join(dirs.uploadsDir, "stale.jpg"), "old");
  await fs.promises.writeFile(path.join(dirs.backupFolder, "uploads.zip"), "fake zip");

  let command = null;
  await restoreUploads(dirs.backupFolder, "uploads.zip", {
    backendRoot: dirs.backendRoot,
    uploadsDir: dirs.uploadsDir,
    runCommand: async function (name, args, options) {
      command = { name, args, options };
    },
  });

  assert.equal(fs.existsSync(path.join(dirs.uploadsDir, "stale.jpg")), false);
  assert.equal(command.name, "powershell.exe");
  assert.match(command.args[2], new RegExp("-DestinationPath '" + dirs.uploadsDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "'"));
  assert.doesNotMatch(command.args[2], new RegExp("-DestinationPath '" + dirs.backendRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "'"));
});
