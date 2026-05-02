const assert = require("node:assert/strict");
const { test } = require("node:test");

const database = require("../config/database");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    sent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.sent = true;
      return this;
    },
    send(body) {
      this.body = body;
      this.sent = true;
      return this;
    },
  };
}

test("deleteCategory refuses to delete a category that still contains products", async (t) => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql.includes("SELECT id FROM restaurants")) {
        return [[{ id: 10 }]];
      }
      if (sql.includes("SELECT COUNT(*) AS count FROM products")) {
        return [[{ count: 1 }]];
      }
      if (sql.includes("DELETE FROM categories")) {
        throw new Error("delete should not run");
      }

      throw new Error("Unexpected query: " + sql);
    },
  };

  t.mock.method(database, "getPool", () => pool);
  delete require.cache[require.resolve("./categoryController")];
  const categoryController = require("./categoryController");

  const req = {
    params: { id: "5" },
    user: { id: 3 },
  };
  const res = createResponse();

  await categoryController.deleteCategory(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /plats de cette catégorie/);
  assert.equal(
    calls.some((call) => call.sql.includes("DELETE FROM categories")),
    false
  );
});
