const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseStrictPositiveIntId,
  getPublicMenuLookupPlan,
} = require("./publicMenuLookup");

describe("parseStrictPositiveIntId", function () {
  it("accepte un identifiant décimal strict", function () {
    assert.equal(parseStrictPositiveIntId("12"), 12);
    assert.equal(parseStrictPositiveIntId("1"), 1);
  });

  it("refuse la coercition Number() (hex / scientifique / décimal)", function () {
    assert.equal(parseStrictPositiveIntId("0x10"), null);
    assert.equal(parseStrictPositiveIntId("1e2"), null);
    assert.equal(parseStrictPositiveIntId("12.0"), null);
    assert.equal(parseStrictPositiveIntId("012"), null);
    assert.equal(parseStrictPositiveIntId("0"), null);
  });
});

describe("getPublicMenuLookupPlan", function () {
  it("traite /restaurant/<slug> (lookup=slug) uniquement comme slug", function () {
    assert.deepEqual(getPublicMenuLookupPlan("12", { lookup: "slug" }), {
      key: "12",
      trySlug: true,
      tryId: null,
    });
    assert.deepEqual(getPublicMenuLookupPlan("0x10", { lookup: "slug" }), {
      key: "0x10",
      trySlug: true,
      tryId: null,
    });
  });

  it("traite /menu/<id> numérique comme id, pas comme slug", function () {
    assert.deepEqual(getPublicMenuLookupPlan("12", {}), {
      key: "12",
      trySlug: false,
      tryId: 12,
    });
  });

  it("traite un slug non numérique comme slug même sans lookup", function () {
    assert.deepEqual(getPublicMenuLookupPlan("chez-maman", {}), {
      key: "chez-maman",
      trySlug: true,
      tryId: null,
    });
  });
});
