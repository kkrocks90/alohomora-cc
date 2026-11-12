import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFlatDiscountPaise,
  getActiveFlatDiscount,
  saveFlatDiscount,
  validateFlatDiscount,
} from "./flat-discount.js";

function makeDatabase(row = null) {
  const state = { row };
  return {
    state,
    prepare(sql) {
      return {
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          return state.row;
        },
        async run() {
          const [name, percentage, active, endDate, category] = this.values;
          state.row = { name, percentage, active, end_date: endDate, category };
        },
      };
    },
  };
}

test("flat discount validation accepts whole percentages only", () => {
  assert.deepEqual(validateFlatDiscount({ name: " Diwali  sale ", percentage: "10", active: true, endDate: "2026-11-30" }), {
    name: "Diwali sale",
    percentage: 10,
    active: true,
    endDate: "2026-11-30",
    category: "",
  });
  assert.throws(() => validateFlatDiscount({ name: "x", percentage: 0 }), /1 to 90/);
  assert.throws(() => validateFlatDiscount({ name: "x", percentage: 12.5 }), /1 to 90/);
  assert.throws(() => validateFlatDiscount({ name: "x", percentage: 95 }), /1 to 90/);
  assert.throws(() => validateFlatDiscount({ name: "", percentage: 10 }), /name/);
  assert.throws(() => validateFlatDiscount({ name: "x", percentage: 10, endDate: "soon" }), /end date/);
});

test("flat discount is rounded down in paise", () => {
  assert.equal(calculateFlatDiscountPaise(99900, { percentage: 10 }), 9990);
  assert.equal(calculateFlatDiscountPaise(333, { percentage: 10 }), 33);
});

test("a category flat discount only counts that category's lines", () => {
  const items = [
    { product: { tag: "Hampers", price: 1000 }, quantity: 1 },
    { product: { tag: "Bulk", extraTags: ["Hampers"], price: 500 }, quantity: 2, unitPrice: 600 },
    { product: { tag: "Candy", price: 200 }, quantity: 3 },
  ];
  assert.equal(calculateFlatDiscountPaise(280000, { percentage: 10, category: "Hampers" }, items), 22000);
  assert.equal(calculateFlatDiscountPaise(280000, { percentage: 10, category: "" }, items), 28000);
});

test("only an active, unexpired flat discount is offered", async () => {
  const database = makeDatabase();
  assert.equal(await getActiveFlatDiscount(database), null);

  await saveFlatDiscount(database, { name: "Sale", percentage: 15, active: true, endDate: "2026-11-30" });
  assert.equal((await getActiveFlatDiscount(database, new Date("2026-11-30T10:00:00Z"))).percentage, 15);
  assert.equal(await getActiveFlatDiscount(database, new Date("2026-12-01T00:00:00Z")), null);

  await saveFlatDiscount(database, { name: "Sale", percentage: 15, active: false, endDate: "" });
  assert.equal(await getActiveFlatDiscount(database), null);
});

test("a missing table is treated as no flat discount", async () => {
  const database = { prepare() { throw new Error("no such table"); } };
  assert.equal(await getActiveFlatDiscount(database), null);
});
