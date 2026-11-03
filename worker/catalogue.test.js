import test from "node:test";
import assert from "node:assert/strict";
import { ensureCatalogue, getCategories, getProductById, getProductByIdAny, getProducts, publicCatalogue, unitPriceRupees } from "./catalogue.js";

function database(rows, categories = [{ name: "Gifts" }]) {
  return {
    prepare(sql) {
      return {
        async all() {
          if (/FROM products/i.test(sql)) return { results: rows };
          if (/FROM catalogue_categories/i.test(sql)) return { results: categories };
          return { results: [] };
        },
      };
    },
  };
}

const row = (overrides) => ({
  product_id: "p1",
  name: "Test box",
  description: "d",
  price: 123,
  image: "p1.jpg",
  tag: "Hampers",
  extra_tags: "[]",
  pack_size: "Pack of 4",
  flavours: '["A","B"]',
  featured: 1,
  customizable: 1,
  active: 1,
  sort_order: 0,
  ...overrides,
});

test("serves the bundled catalogue until D1 has products", async () => {
  await ensureCatalogue({ ORDERS_DB: database([]) }, { force: true });
  assert.ok(getProducts().length > 40);
});

test("loads products and categories from D1 and hides inactive ones", async () => {
  await ensureCatalogue(
    { ORDERS_DB: database([row({}), row({ product_id: "p2", active: 0 }), row({ product_id: "p3", customizable: 0, extra_tags: '["Kids"]' })]) },
    { force: true },
  );
  assert.deepEqual(getProducts().map((product) => product.id), ["p1", "p3"]);
  assert.equal(getProductById("p1").price, 123);
  assert.deepEqual(getProductById("p1").flavours, ["A", "B"]);
  assert.equal(getProductById("p3").customizable, false);
  assert.equal(getProductById("p2"), undefined);
  assert.equal(getProductByIdAny("p2").id, "p2");
  assert.ok(getCategories().includes("Gifts") && getCategories().includes("Kids"));
  const publicData = publicCatalogue();
  assert.equal(publicData.products.length, 2);
  assert.equal("active" in publicData.products[0], false);
});

test("keeps the last catalogue when the query fails", async () => {
  const broken = { prepare: () => ({ all: async () => { throw new Error("no such table: products"); } }) };
  await ensureCatalogue({ ORDERS_DB: broken }, { force: true });
  assert.equal(getProductById("p1").price, 123);
});

test("adds the flavour extra from D1 to the unit price", async () => {
  const db = {
    prepare(sql) {
      return {
        async all() {
          if (/FROM products/i.test(sql)) return { results: [row({})] };
          if (/FROM flavours/i.test(sql)) return { results: [{ name: "A", extra_percent: 20 }, { name: "B", extra_percent: 0 }] };
          return { results: [] };
        },
      };
    },
  };
  await ensureCatalogue({ ORDERS_DB: db }, { force: true });
  const product = getProductById("p1");
  assert.equal(unitPriceRupees(product, "A"), 148);
  assert.equal(unitPriceRupees(product, "B"), 123);
  assert.equal(unitPriceRupees(product, ""), 123);
  assert.deepEqual(publicCatalogue().flavours.find((flavour) => flavour.name === "A"), { name: "A", extra: 20 });
});

test("bundled flavours include Assorted at no extra cost", async () => {
  await ensureCatalogue({ ORDERS_DB: database([row({})]) }, { force: true });
  assert.deepEqual(publicCatalogue().flavours.find((flavour) => flavour.name === "Assorted"), { name: "Assorted", extra: 0 });
});
