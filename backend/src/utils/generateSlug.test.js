const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { generateSlug, toPublicSlugBase } = require("./generateSlug");

describe("toPublicSlugBase", function () {
  it("préfixe un nom uniquement numérique pour ne pas collisionner avec /menu/<id>", function () {
    assert.equal(toPublicSlugBase("12"), "r-12");
    assert.equal(toPublicSlugBase("2024"), "r-2024");
  });

  it("laisse intact un slug alphabétique", function () {
    assert.equal(toPublicSlugBase("Chez Maman"), "chez-maman");
    assert.equal(generateSlug("Chez Maman"), "chez-maman");
  });
});
