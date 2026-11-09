import test from "node:test";
import assert from "node:assert/strict";
import { contactMatches, trackOrder } from "./tracking.js";
import { parseReview } from "./reviews.js";

const order = {
  order_id: "CC-240101-AB12C",
  order_status: "preparing",
  payment_status: "paid",
  delivery_method: "Porter (manual booking)",
  created_at: "2024-01-01T00:00:00Z",
  event_date: "",
  items_json: JSON.stringify([{ name: "Choco square", quantity: 2 }]),
  customer_phone: "+91 98765 43210",
  customer_email: "Asha@Example.com",
};

function env(row) {
  return { ORDERS_DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) } };
}

function req(body) {
  return new Request("https://x.test/orders/track", { method: "POST", body: JSON.stringify(body) });
}

test("contact matches by phone digits or email", () => {
  assert.equal(contactMatches(order, "9876543210"), true);
  assert.equal(contactMatches(order, "+91-98765-43210"), true);
  assert.equal(contactMatches(order, "asha@example.com"), true);
  assert.equal(contactMatches(order, "1234567890"), false);
  assert.equal(contactMatches(order, "other@example.com"), false);
  assert.equal(contactMatches(order, "43210"), false);
});

test("tracking returns status without personal details", async () => {
  const { status, body } = await trackOrder(req({ orderId: "cc-240101-ab12c", contact: "9876543210" }), env(order));
  assert.equal(status, 200);
  assert.equal(body.order.orderStatus, "preparing");
  assert.deepEqual(body.order.items, [{ name: "Choco square", quantity: 2 }]);
  assert.equal(JSON.stringify(body).includes("98765"), false);
});

test("tracking rejects a wrong contact or unknown order the same way", async () => {
  const wrong = await trackOrder(req({ orderId: "CC-240101-AB12C", contact: "9999999999" }), env(order));
  const unknown = await trackOrder(req({ orderId: "CC-240101-AB12C", contact: "9876543210" }), env(null));
  assert.equal(wrong.status, 404);
  assert.equal(unknown.status, 404);
  assert.equal(wrong.body.error, unknown.body.error);
  assert.equal((await trackOrder(req({ orderId: "nope", contact: "9876543210" }), env(order))).status, 400);
});

test("review validation", () => {
  const ok = parseReview({ name: " Asha ", rating: 5, reviewText: "Lovely", published: false });
  assert.equal(ok.name, "Asha");
  assert.equal(ok.published, 0);
  assert.throws(() => parseReview({ name: "A", rating: 6, reviewText: "x" }), /rating/);
  assert.throws(() => parseReview({ name: "", rating: 5, reviewText: "x" }), /name/);
  assert.throws(() => parseReview({ name: "A", rating: 5, reviewText: "" }), /review/);
});
