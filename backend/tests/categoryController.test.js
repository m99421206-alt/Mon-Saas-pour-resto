const assert = require("node:assert");
const { test, mock } = require("node:test");

function loadControllerWithPool(pool) {
  var databasePath = require.resolve("../src/config/database");
  var controllerPath = require.resolve("../src/controllers/categoryController");

  delete require.cache[controllerPath];
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: {
      getPool: function () {
        return pool;
      },
    },
  };

  return require("../src/controllers/categoryController");
}

function createResponse() {
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
      this.sent = true;
      return this;
    },
    send: function (body) {
      this.body = body;
      this.sent = true;
      return this;
    },
  };
}

test("deleteCategory refuses to delete categories that still contain products", async function () {
  var queries = [];
  var connection = {
    beginTransaction: mock.fn(async function () {}),
    rollback: mock.fn(async function () {}),
    commit: mock.fn(async function () {}),
    release: mock.fn(function () {}),
    query: mock.fn(async function (sql, params) {
      queries.push({ sql: sql, params: params });
      if (sql.indexOf("SELECT id FROM categories") === 0) {
        return [[{ id: 7 }]];
      }
      if (sql.indexOf("SELECT COUNT(*) AS product_count") === 0) {
        return [[{ product_count: 2 }]];
      }
      if (sql.indexOf("DELETE FROM categories") === 0) {
        throw new Error("delete should not be called");
      }
      throw new Error("unexpected query: " + sql);
    }),
  };
  var pool = {
    query: mock.fn(async function () {
      return [[{ id: 3 }]];
    }),
    getConnection: mock.fn(async function () {
      return connection;
    }),
  };
  var controller = loadControllerWithPool(pool);
  var res = createResponse();

  await controller.deleteCategory({ params: { id: "7" }, user: { id: 11 } }, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    message: "Impossible de supprimer une catégorie contenant des produits.",
  });
  assert.equal(connection.rollback.mock.callCount(), 1);
  assert.equal(connection.commit.mock.callCount(), 0);
  assert.equal(connection.release.mock.callCount(), 1);
  assert.equal(
    queries.some(function (query) {
      return query.sql.indexOf("DELETE FROM categories") === 0;
    }),
    false
  );
});

test("deleteCategory deletes empty categories for the authenticated restaurant", async function () {
  var queries = [];
  var connection = {
    beginTransaction: mock.fn(async function () {}),
    rollback: mock.fn(async function () {}),
    commit: mock.fn(async function () {}),
    release: mock.fn(function () {}),
    query: mock.fn(async function (sql, params) {
      queries.push({ sql: sql, params: params });
      if (sql.indexOf("SELECT id FROM categories") === 0) {
        return [[{ id: 7 }]];
      }
      if (sql.indexOf("SELECT COUNT(*) AS product_count") === 0) {
        return [[{ product_count: 0 }]];
      }
      if (sql.indexOf("DELETE FROM categories") === 0) {
        return [{ affectedRows: 1 }];
      }
      throw new Error("unexpected query: " + sql);
    }),
  };
  var pool = {
    query: mock.fn(async function () {
      return [[{ id: 3 }]];
    }),
    getConnection: mock.fn(async function () {
      return connection;
    }),
  };
  var controller = loadControllerWithPool(pool);
  var res = createResponse();

  await controller.deleteCategory({ params: { id: "7" }, user: { id: 11 } }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(connection.rollback.mock.callCount(), 0);
  assert.equal(connection.commit.mock.callCount(), 1);
  assert.equal(connection.release.mock.callCount(), 1);
  assert.deepEqual(queries[2], {
    sql: "DELETE FROM categories WHERE id = ? AND restaurant_id = ?",
    params: [7, 3],
  });
});
