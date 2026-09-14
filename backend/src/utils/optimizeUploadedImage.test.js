const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { optimizeUploadedImage } = require("./optimizeUploadedImage");

describe("optimizeUploadedImage", function () {
  var dir;

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "am-opt-"));
  });

  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function writeSource(filename, format) {
    var filePath = path.join(dir, filename);
    var pipeline = sharp({
      create: { width: 48, height: 32, channels: 3, background: "#2266aa" },
    });
    if (format === "jpeg") {
      await pipeline.jpeg().toFile(filePath);
    } else if (format === "png") {
      await pipeline.png().toFile(filePath);
    } else {
      await pipeline.webp().toFile(filePath);
    }
    return filePath;
  }

  it("converts a JPEG upload to webp and removes the original", async function () {
    var filename = "111-jpeg.jpg";
    var filePath = await writeSource(filename, "jpeg");

    var result = await optimizeUploadedImage({ path: filePath, filename: filename });

    assert.equal(result.rejected, undefined);
    assert.equal(result.optimized, true);
    assert.equal(result.filename, "111-jpeg.webp");
    assert.equal(fs.existsSync(filePath), false);
    assert.equal(fs.existsSync(path.join(dir, "111-jpeg.webp")), true);
  });

  it("accepts an already-webp upload instead of deleting it", async function () {
    var filename = "222-source.webp";
    var filePath = await writeSource(filename, "webp");
    assert.equal(fs.existsSync(filePath), true);

    var result = await optimizeUploadedImage({ path: filePath, filename: filename });

    assert.equal(result.rejected, undefined);
    assert.equal(result.optimized, true);
    assert.equal(result.filename, filename);
    assert.equal(fs.existsSync(filePath), true);
    var stat = fs.statSync(filePath);
    assert.ok(stat.size > 0);
  });

  it("converts a PNG upload to webp", async function () {
    var filename = "333-source.png";
    var filePath = await writeSource(filename, "png");

    var result = await optimizeUploadedImage({ path: filePath, filename: filename });

    assert.equal(result.optimized, true);
    assert.equal(result.filename, "333-source.webp");
    assert.equal(fs.existsSync(filePath), false);
    assert.equal(fs.existsSync(path.join(dir, "333-source.webp")), true);
  });

  it("rejects a missing file object", async function () {
    var result = await optimizeUploadedImage(null);
    assert.equal(result.rejected, true);
  });
});
