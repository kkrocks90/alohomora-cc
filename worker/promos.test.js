import assert from "node:assert/strict";
import test from "node:test";
import { quotePromo, validatePromoDefinition, validatePromoLimits } from "./promos.js";

function makeDatabase(promo, redemptions = []) {
  return {
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (/SELECT \* FROM promo_codes/i.test(sql)) return promo;
          if (/SELECT status FROM promo_redemptions/i.test(sql)) {
            return redemptions.find((redemption) =>
              redemption.promo_id === this.values[0] &&
              redemption.customer_email === this.values[1] &&
              redemption.status === "redeemed") ?? null;
          }
          if (/SELECT reservation_id FROM promo_redemptions/i.test(sql)) {
            return redemptions.find((redemption) =>
              redemption.promo_id === this.values[0] &&
              redemption.customer_email === this.values[1] &&
              redemption.status === "reserved" &&
              redemption.expires_at > this.values[2]) ?? null;
          }
          if (/COUNT\(DISTINCT customer_email\)/i.test(sql)) {
            const used = new Set(redemptions.filter((redemption) =>
              redemption.promo_id === this.values[0] &&
              (redemption.status === "redeemed" ||
                (redemption.status === "reserved" && redemption.expires_at > this.values[1])))
              .map((redemption) => redemption.customer_email));
            return { used: used.size };
          }
          throw new Error(`Unexpected promo query: ${sql}`);
        },
      };
    },
  };
}

const cartWithTreatsAndGift = [
  { product: { id: "product-1001", price: 800, tag: "Chocolate treats" }, quantity: 1 },
  { product: { id: "product-1002", price: 2400, tag: "Gifts & hampers" }, quantity: 1 },
];
const today = new Date("2026-04-20T12:00:00.000Z");

test("percentage promos discount only products in the selected category", async () => {
  const promo = {
    promo_id: "promo_1",
    name: "Treat discount",
    code: "CC-TREATS",
    type: "percentage",
    percentage: 10,
    target_type: "category",
    target_value: "Chocolate treats",
    amount_paise: null,
    minimum_subtotal_paise: null,
    max_redemptions: null,
    end_date: "2026-04-30",
    active: 1,
  };
  const quote = await quotePromo(makeDatabase(promo), " cc-treats ", "customer@example.com", cartWithTreatsAndGift, today);
  assert.equal(quote.subtotalPaise, 320000);
  assert.equal(quote.eligibleSubtotalPaise, 80000);
  assert.equal(quote.discountPaise, 8000);
  assert.equal(quote.payablePaise, 312000);
});

test("fixed amount promos require a strictly greater subtotal and cap at the subtotal", async () => {
  const promo = {
    promo_id: "promo_2",
    name: "Large order",
    code: "CC-FIXED",
    type: "fixed",
    percentage: null,
    target_type: null,
    target_value: null,
    amount_paise: 300000,
    minimum_subtotal_paise: 160000,
    max_redemptions: null,
    end_date: null,
    active: 1,
  };
  const database = makeDatabase(promo);
  await assert.rejects(
    quotePromo(database, "CC-FIXED", "customer@example.com", [
      { product: { price: 800 }, quantity: 2 },
    ], today),
    /must be greater than ₹1600/,
  );
  const quote = await quotePromo(database, "CC-FIXED", "customer@example.com", [
    { product: { price: 800 }, quantity: 3 },
  ], today);
  assert.equal(quote.discountPaise, 240000);
  assert.equal(quote.payablePaise, 0);
});

test("expired, inactive, already redeemed, and exhausted limited promos are rejected", async () => {
  const promo = {
    promo_id: "promo_3",
    name: "Limited",
    code: "CC-LIMIT",
    type: "percentage",
    percentage: 20,
    target_type: "all",
    target_value: "",
    amount_paise: null,
    minimum_subtotal_paise: null,
    max_redemptions: 2,
    end_date: "2026-04-20",
    active: 1,
  };
  const cart = [{ product: { price: 800 }, quantity: 1 }];
  await assert.rejects(
    quotePromo(makeDatabase({ ...promo, active: 0 }), promo.code, "customer@example.com", cart, today),
    /no longer active/,
  );
  await assert.rejects(
    quotePromo(makeDatabase({ ...promo, end_date: "2026-04-19" }), promo.code, "customer@example.com", cart, today),
    /expired/,
  );
  await assert.rejects(
    quotePromo(makeDatabase(promo, [{
      promo_id: promo.promo_id,
      customer_email: "customer@example.com",
      status: "redeemed",
    }]), promo.code, "customer@example.com", cart, today),
    /already been redeemed/,
  );
  await assert.rejects(
    quotePromo(makeDatabase(promo, [
      { promo_id: promo.promo_id, customer_email: "one@example.com", status: "redeemed" },
      { promo_id: promo.promo_id, customer_email: "two@example.com", status: "redeemed" },
    ]), promo.code, "customer@example.com", cart, today),
    /reached its redemption limit/,
  );
});

test("an open checkout holds an unlimited promo for that signed-in customer", async () => {
  const promo = {
    promo_id: "promo_open",
    name: "Open checkout",
    code: "CC-OPEN",
    type: "percentage",
    percentage: 10,
    target_type: "all",
    target_value: "",
    amount_paise: null,
    minimum_subtotal_paise: null,
    max_redemptions: null,
    end_date: null,
    active: 1,
  };
  await assert.rejects(
    quotePromo(makeDatabase(promo, [{
      promo_id: promo.promo_id,
      customer_email: "customer@example.com",
      status: "reserved",
      expires_at: "2026-04-20T13:00:00.000Z",
    }]), promo.code, "customer@example.com", [
      { product: { price: 800 }, quantity: 1 },
    ], today),
    /already reserved for an open checkout/,
  );
});

test("admin promo settings validate discount targeting, caps, and dates", () => {
  assert.deepEqual(validatePromoDefinition({
    name: "Chocolate treats",
    type: "percentage",
    percentage: "25",
    targetType: "product",
    targetValue: "product-1001",
  }), {
    name: "Chocolate treats",
    type: "percentage",
    percentage: 25,
    targetType: "product",
    targetValue: "product-1001",
    amountPaise: null,
    minimumSubtotalPaise: null,
  });
  assert.throws(() => validatePromoDefinition({
    name: "Invalid target",
    type: "percentage",
    percentage: 25,
    targetType: "product",
    targetValue: "not-a-product",
  }), /Choose all products/);
  assert.deepEqual(validatePromoLimits({ maxRedemptions: "10", endDate: "2026-12-31" }), {
    maxRedemptions: 10,
    endDate: "2026-12-31",
  });
  assert.throws(() => validatePromoLimits({ maxRedemptions: "0" }), /redemption limit/);
  assert.throws(() => validatePromoLimits({ endDate: "2026-02-31" }), /valid promo end date/);
});
