import assert from "node:assert/strict";
import test from "node:test";
import {
  getDistanceKm,
  getFulfillmentMethod,
  getStoreLocation,
  isValidDeliveryLocation,
  PORTER_RADIUS_KM,
} from "./delivery.js";

test("uses configured decimal store coordinates", () => {
  assert.deepEqual(
    getStoreLocation({ STORE_LATITUDE: "12.345678", STORE_LONGITUDE: "77.123456" }),
    { latitude: 12.345678, longitude: 77.123456 },
  );
});

test("refuses missing and invalid store coordinates", () => {
  assert.equal(getStoreLocation({ STORE_LATITUDE: "REPLACE_WITH_STORE_LATITUDE", STORE_LONGITUDE: "77" }), null);
  assert.equal(getStoreLocation({ STORE_LATITUDE: "91", STORE_LONGITUDE: "77" }), null);
  assert.equal(getStoreLocation({ STORE_LATITUDE: "12", STORE_LONGITUDE: "-181" }), null);
});

test("validates delivery coordinate ranges", () => {
  assert.equal(isValidDeliveryLocation({ latitude: -90, longitude: 180 }), true);
  assert.equal(isValidDeliveryLocation({ latitude: 91, longitude: 0 }), false);
  assert.equal(isValidDeliveryLocation({ latitude: 0, longitude: -181 }), false);
  assert.equal(isValidDeliveryLocation({ latitude: Number.NaN, longitude: 0 }), false);
  assert.equal(isValidDeliveryLocation(null), false);
});

test("calculates a distance of fifteen kilometres at the equator", () => {
  const longitudeAt15Km = (PORTER_RADIUS_KM / 6371.0088) * (180 / Math.PI);
  assert.ok(
    Math.abs(getDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: longitudeAt15Km }) -
      PORTER_RADIUS_KM) < 1e-9,
  );
});

test("selects Porter at 15 km and a courier only beyond 15 km", () => {
  assert.equal(getFulfillmentMethod(15), "Porter (manual booking)");
  assert.equal(getFulfillmentMethod(15.00001), "Courier (manual booking)");
});
