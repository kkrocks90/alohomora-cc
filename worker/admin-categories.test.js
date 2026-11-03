import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const adminToken = "a".repeat(64);
const origin = "https://chocolatecircle.in";

function makeDatabase() {
  const db = {
    categories: [
      { name: "Hampers", sort_order: 1, hidden: 0 },
      { name: "Gifts", sort_order: 2, hidden: 0 },
    ],
    products: [
      { product_id: "p1", name: "Box", description: "", price: 100, image: "a.jpg", images: "[]", tag: "Hampers", extra_tags: '["Gifts"]', pack_size: "", flavours: "[]", featured: 0, customizable: 1, active: 1, sort_order: 0 },
    ],
    promos: [{ target_type: "category", target_value: "Gifts" }],
    fields: [{ field_id: "f1", applies_to_json: '{"mode":"categories","values":["Hampers"]}' }],
    prepare(sql) {
      const statement = {
        values: [],
        sql,
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (/SELECT email FROM customer_sessions/i.test(sql)) return { email: "alohomora.chocolatecircle@gmail.com" };
          if (/MAX\(sort_order\)/i.test(sql)) return { max_sort: Math.max(0, ...db.categories.map((c) => c.sort_order)) };
          if (/COUNT\(\*\) AS total FROM promo_codes/i.test(sql)) {
            return { total: db.promos.filter((p) => p.target_value === this.values[0]).length };
          }
          if (/SELECT name FROM catalogue_categories WHERE name/i.test(sql)) {
            return db.categories.find((c) => c.name === this.values[0]) ?? null;
          }
          return null;
        },
        async all() {
          if (/FROM catalogue_categories/i.test(sql)) return { results: db.categories.map((c) => ({ ...c })) };
          if (/FROM products/i.test(sql)) return { results: db.products.map((p) => ({ ...p })) };
          if (/FROM custom_fields/i.test(sql)) return { results: db.fields.map((f) => ({ ...f })) };
          return { results: [] };
        },
        async run() {
          const [a, b] = this.values;
          if (/INSERT INTO catalogue_categories/i.test(sql)) db.categories.push({ name: a, sort_order: b, hidden: this.values[2] });
          else if (/INSERT OR IGNORE INTO catalogue_categories/i.test(sql)) {
            if (!db.categories.some((c) => c.name === a)) db.categories.push({ name: a, sort_order: b, hidden: 0 });
          } else if (/DELETE FROM catalogue_categories/i.test(sql)) db.categories = db.categories.filter((c) => c.name !== a);
          else if (/UPDATE catalogue_categories SET hidden/i.test(sql)) db.categories.find((c) => c.name === b).hidden = a;
          else if (/UPDATE catalogue_categories SET name/i.test(sql)) db.categories.find((c) => c.name === b).name = a;
          else if (/UPDATE products SET tag/i.test(sql)) db.products.filter((p) => p.tag === b).forEach((p) => { p.tag = a; });
          else if (/UPDATE products SET extra_tags/i.test(sql)) db.products.find((p) => p.product_id === b).extra_tags = a;
          else if (/UPDATE promo_codes/i.test(sql)) db.promos.filter((p) => p.target_value === b).forEach((p) => { p.target_value = a; });
          else if (/UPDATE custom_fields/i.test(sql)) db.fields.find((f) => f.field_id === b).applies_to_json = a;
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return [];
    },
  };
  return db;
}

async function call(db, path, body) {
  const env = { ALLOWED_ORIGIN: origin, ADMIN_EMAIL: "alohomora.chocolatecircle@gmail.com", AUTH_TOKEN_SECRET: "test-secret", ORDERS_DB: db };
  const response = await worker.fetch(
    new Request(`https://checkout.example.com${path}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    }),
    env,
  );
  return { status: response.status, body: await response.json() };
}

test("creates a category and rejects case-insensitive duplicates", async () => {
  const db = makeDatabase();
  const created = await call(db, "/admin/categories/create", { name: "  Wedding   Favours " });
  assert.equal(created.status, 200);
  assert.ok(created.body.categories.some((c) => c.name === "Wedding Favours"));
  const duplicate = await call(db, "/admin/categories/create", { name: "wedding favours" });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.error, /already exists/);
});

test("renaming a category updates products, promos and custom fields", async () => {
  const db = makeDatabase();
  const renamed = await call(db, "/admin/categories/update", { name: "Hampers", newName: "Gift Hampers" });
  assert.equal(renamed.status, 200);
  assert.equal(db.products[0].tag, "Gift Hampers");
  assert.deepEqual(JSON.parse(db.fields[0].applies_to_json).values, ["Gift Hampers"]);
  const gifts = await call(db, "/admin/categories/update", { name: "Gifts", newName: "Presents" });
  assert.equal(gifts.status, 200);
  assert.equal(db.promos[0].target_value, "Presents");
  assert.equal(db.products[0].extra_tags, '["Presents"]');
});

test("hides and shows a category", async () => {
  const db = makeDatabase();
  const hidden = await call(db, "/admin/categories/update", { name: "Gifts", hidden: true });
  assert.equal(hidden.body.categories.find((c) => c.name === "Gifts").hidden, true);
  const shown = await call(db, "/admin/categories/update", { name: "Gifts", hidden: false });
  assert.equal(shown.body.categories.find((c) => c.name === "Gifts").hidden, false);
});

test("a category with products, promos or fields cannot be deleted, an empty one can", async () => {
  const db = makeDatabase();
  const withProducts = await call(db, "/admin/categories/delete", { name: "Hampers" });
  assert.equal(withProducts.status, 400);
  assert.match(withProducts.body.error, /1 product/);
  await call(db, "/admin/categories/create", { name: "Empty" });
  const deleted = await call(db, "/admin/categories/delete", { name: "Empty" });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.categories.some((c) => c.name === "Empty"), false);
  const missing = await call(db, "/admin/categories/delete", { name: "Nope" });
  assert.equal(missing.status, 400);
});
