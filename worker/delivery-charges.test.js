import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DELIVERY_SETTINGS,
  calculateDeliveryCharge,
  getDeliverySettings,
  parseWeightGrams,
  previewDeliveryCharge,
  saveDeliverySettings,
  totalWeightGrams,
  validateDeliverySettings,
} from "./delivery-charges.js";
import { PincodeLookupError } from "./pincode.js";
import { getRoadDistanceKm } from "./delivery.js";

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

test("preview works out distance and state from a PIN code", async () => {
  const env = { STORE_LATITUDE: "13.0827", STORE_LONGITUDE: "80.2707" };
  const settings = { ...on };
  const lookup = async (pin) => {
    if (pin === "600001") return { pincode: pin, city: "Chennai", state: "Tamil Nadu", latitude: 13.09, longitude: 80.28 };
    if (pin === "560001") return { pincode: pin, city: "Bengaluru", state: "Karnataka", latitude: 12.9716, longitude: 77.5946 };
    throw new PincodeLookupError("We couldn’t find that PIN code. Check it and try again.");
  };
  const near = await previewDeliveryCharge(env, { settings, method: "delivery", pincode: "600001", weightGrams: 500 }, lookup);
  assert.equal(near.charge.kind, "porter");
  assert.equal(near.place.city, "Chennai");
  const far = await previewDeliveryCharge(env, { settings, method: "delivery", pincode: "560001", weightGrams: 1000 }, lookup);
  assert.equal(far.charge.kind, "courier");
  assert.equal(far.charge.rupees, 120 + 60);
  assert.ok(far.distanceKm > 250);
  const pickup = await previewDeliveryCharge(env, { settings, method: "pickup", weightGrams: 500 }, lookup);
  assert.equal(pickup.charge.rupees, 0);
  await assert.rejects(previewDeliveryCharge(env, { settings, method: "delivery", pincode: "111111", weightGrams: 500 }, lookup), /find that PIN/);
  await assert.rejects(previewDeliveryCharge(env, { settings, method: "delivery", pincode: "600001", weightGrams: 30000 }, lookup), /weight/);
  await assert.rejects(previewDeliveryCharge({}, { settings, method: "delivery", pincode: "600001", weightGrams: 500 }, lookup), /store location/);
});

test("road distance comes from Google when a key is set, otherwise null", async () => {
  const from = { latitude: 12.92, longitude: 77.6 };
  const to = { latitude: 12.97, longitude: 77.59 };
  assert.equal(await getRoadDistanceKm({}, from, to), null);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ status: "OK", rows: [{ elements: [{ status: "OK", distance: { value: 8400 } }] }] });
    assert.equal(await getRoadDistanceKm({ GOOGLE_MAPS_API_KEY: "k" }, from, to), 8.4);
    globalThis.fetch = async () => Response.json({ status: "REQUEST_DENIED", rows: [] });
    assert.equal(await getRoadDistanceKm({ GOOGLE_MAPS_API_KEY: "k" }, from, to), null);
  } finally {
    globalThis.fetch = original;
  }
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
