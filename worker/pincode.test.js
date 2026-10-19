import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";
import { isValidPincode, lookupPincode } from "./pincode.js";

function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = original;
  });
}

const providerFetch = async (url) =>
  String(url).startsWith("https://api.postalpincode.in/")
    ? Response.json([{ Status: "Success", PostOffice: [{ District: "Chennai", State: "Tamil Nadu" }] }])
    : Response.json([{ lat: "12.98", lon: "80.22" }]);

test("validates six-digit Indian PIN codes", () => {
  assert.equal(isValidPincode("600042"), true);
  assert.equal(isValidPincode("060042"), false);
  assert.equal(isValidPincode("60004"), false);
  assert.equal(isValidPincode(600042), false);
});

test("looks up city, state, and approximate coordinates for a PIN code", async () => {
  await withFetch(providerFetch, async () => {
    assert.deepEqual(await lookupPincode("600042"), {
      pincode: "600042",
      city: "Chennai",
      state: "Tamil Nadu",
      latitude: 12.98,
      longitude: 80.22,
    });
  });
});

test("reports unknown PIN codes", async () => {
  await withFetch(
    async (url) =>
      String(url).startsWith("https://api.postalpincode.in/")
        ? Response.json([{ Status: "Error", PostOffice: null }])
        : Response.json([]),
    async () => {
      await assert.rejects(lookupPincode("999999"), /couldn’t find that PIN code/i);
    },
  );
});

test("the PIN endpoint returns only the PIN code, city, and state", async () => {
  await withFetch(providerFetch, async () => {
    const response = await worker.fetch(
      new Request("https://checkout.example.com/pincode/600042", { headers: { Origin: "https://shop.example.com" } }),
      { ALLOWED_ORIGIN: "https://shop.example.com" },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { pincode: "600042", city: "Chennai", state: "Tamil Nadu" });
  });
});
