const assert = require("node:assert/strict");
const test = require("node:test");

test("deleteCategory refuses to delete a category that still has products", async function (t) {
  const calls = [];
  const categoryController = withMockPool(t, function () {
    return {
      query: async function (sql, params) {
        calls.push({ sql, params });

        if (sql.indexOf("SELECT id FROM restaurants") === 0) {
          return [[{ id: 7 }]];
        }

        if (sql.indexOf("SELECT id FROM products") === 0) {
          return [[{ id: 11 }]];
        }

        if (sql.indexOf("DELETE FROM categories") === 0) {
          throw new Error("category delete should not run");
        }

        throw new Error("Unexpected query: " + sql);
      },
    };
  });

  const req = {
    params: { id: "5" },
    user: { id: 3 },
  };
  const res = createMockResponse();

  await categoryController.deleteCategory(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    message: "Impossible de supprimer une catégorie qui contient encore des produits.",
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /SELECT id FROM products/);
});

test("deleteCategory deletes an empty category", async function (t) {
  const calls = [];
  const categoryController = withMockPool(t, function () {
    return {
      query: async function (sql, params) {
        calls.push({ sql, params });

        if (sql.indexOf("SELECT id FROM restaurants") === 0) {
          return [[{ id: 7 }]];
        }

        if (sql.indexOf("SELECT id FROM products") === 0) {
          return [[]];
        }

        if (sql.indexOf("DELETE FROM categories") === 0) {
          return [{ affectedRows: 1 }];
        }

        throw new Error("Unexpected query: " + sql);
      },
    };
  });

  const req = {
    params: { id: "5" },
    user: { id: 3 },
  };
  const res = createMockResponse();

  await categoryController.deleteCategory(req, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.sent, true);
  assert.equal(calls.length, 3);
  assert.match(calls[2].sql, /DELETE FROM categories/);
});

function withMockPool(t, getPool) {
  const databasePath = require.resolve("../config/database");
  const controllerPath = require.resolve("./categoryController");
  const database = require(databasePath);
  const originalGetPool = database.getPool;

  database.getPool = getPool;
  delete require.cache[controllerPath];

  t.after(function () {
    database.getPool = originalGetPool;
    delete require.cache[controllerPath];
  });

  return require(controllerPath);
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    sent: false,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (body) {
      this.body = body;
      return this;
    },
    send: function () {
      this.sent = true;
      return this;
    },
  };
}
