import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DELIVERY_SETTINGS,
  calculateDeliveryCharge,
  getDeliverySettings,
  parseWeightGrams,
  saveDeliverySettings,
  totalWeightGrams,
  validateDeliverySettings,
} from "./delivery-charges.js";

const on = { ...DEFAULT_DELIVERY_SETTINGS, enabled: true, storeState: "Tamil Nadu" };

test("delivery charges are disabled by default", () => {
  assert.equal(DEFAULT_DELIVERY_SETTINGS.enabled, false);
  const charge = calculateDeliveryCharge(DEFAULT_DELIVERY_SETTINGS, { method: "delivery", distanceKm: 10, weightGrams: 500 });
  assert.equal(charge.rupees, 0);
  assert.equal(charge.kind, "disabled");
});

test("pickup is always free", () => {
  assert.equal(calculateDeliveryCharge(on, { method: "pickup", distanceKm: 500, weightGrams: 9000 }).rupees, 0);
});

test("Porter charges base plus extra km within the radius", () => {
  assert.equal(calculateDeliveryCharge(on, { method: "delivery", distanceKm: 1, weightGrams: 500 }).rupees, 48);
  assert.equal(calculateDeliveryCharge(on, { method: "delivery", distanceKm: 5.2, weightGrams: 500 }).rupees, 48 + 5 * 10);
  assert.equal(calculateDeliveryCharge(on, { method: "delivery", distanceKm: 30, weightGrams: 500 }).kind, "porter");
});

test("courier is used beyond the radius and priced by state and weight", () => {
  const same = calculateDeliveryCharge(on, { method: "delivery", distanceKm: 120, customerState: "tamil nadu", weightGrams: 1200 });
  assert.equal(same.kind, "courier");
  assert.equal(same.rupees, 75 + 2 * 15);
  const other = calculateDeliveryCharge(on, { method: "delivery", distanceKm: 900, customerState: "Delhi", weightGrams: 500 });
  assert.equal(other.rupees, 120);
});

test("weights are parsed from text and fall back to the default", () => {
  assert.equal(parseWeightGrams("250 g"), 250);
  assert.equal(parseWeightGrams("1.2kg"), 1200);
  assert.equal(parseWeightGrams("about a kilo"), null);
  assert.equal(totalWeightGrams([{ weight: "250 g", quantity: 2 }, { weight: "", quantity: 1 }], on), 1000);
});

test("settings are validated and round-trip through storage", async () => {
  assert.throws(() => validateDeliverySettings({ ...on, porter: { ...on.porter, radiusKm: 0 } }), /^Error: Enter/);
  const state = { row: null };
  const database = {
    prepare() {
      return {
        bind(json) { this.json = json; return this; },
        async first() { return state.row; },
        async run() { state.row = { config_json: this.json }; },
      };
    },
  };
  assert.equal((await getDeliverySettings(database)).enabled, false);
  await saveDeliverySettings(database, { ...on, enabled: true });
  assert.equal((await getDeliverySettings(database)).enabled, true);
});
