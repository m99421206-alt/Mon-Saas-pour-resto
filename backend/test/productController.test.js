const assert = require("node:assert/strict");
const test = require("node:test");

function loadProductController(pool) {
  const dbPath = require.resolve("../src/config/database");
  const controllerPath = require.resolve("../src/controllers/productController");

  delete require.cache[controllerPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      getPool: function () {
        return pool;
      },
    },
  };

  return require(controllerPath);
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (body) {
      this.body = body;
      return this;
    },
    send: function () {
      return this;
    },
  };
}

test("updateProduct rolls back when variant replacement fails", async function () {
  const calls = [];
  const connection = {
    released: false,
    beginTransaction: async function () {
      calls.push("begin");
    },
    query: async function (sql) {
      if (sql.startsWith("UPDATE products")) {
        calls.push("update");
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("DELETE FROM product_variants")) {
        calls.push("delete-variants");
        return [{}];
      }
      if (sql.startsWith("INSERT INTO product_variants")) {
        calls.push("insert-variant");
        throw new Error("variant insert failed");
      }
      throw new Error("Unexpected connection query: " + sql);
    },
    commit: async function () {
      calls.push("commit");
    },
    rollback: async function () {
      calls.push("rollback");
    },
    release: function () {
      this.released = true;
      calls.push("release");
    },
  };

  const pool = {
    query: async function (sql) {
      if (sql.startsWith("SELECT id FROM restaurants")) {
        return [[{ id: 10 }]];
      }
      if (sql.startsWith("SELECT id FROM categories")) {
        return [[{ id: 20 }]];
      }
      throw new Error("Unexpected pool query: " + sql);
    },
    getConnection: async function () {
      calls.push("get-connection");
      return connection;
    },
  };

  const controller = loadProductController(pool);
  const req = {
    user: { id: 1 },
    params: { id: "99" },
    body: {
      name: "Poulet",
      price: 1200,
      category_id: 20,
      has_sizes: 1,
      variants: [{ name: "Grand", price: 1500 }],
    },
  };
  const res = createResponse();

  await controller.updateProduct(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(calls, [
    "get-connection",
    "begin",
    "update",
    "delete-variants",
    "insert-variant",
    "rollback",
    "release",
  ]);
  assert.equal(connection.released, true);
});
