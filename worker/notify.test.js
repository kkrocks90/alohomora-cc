import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCorporateEnquiry, sendCorporateEnquiry, sendOrderEmails } from "./notify.js";

const order = {
  orderId: "CC-1",
  customerName: "Asha <b>",
  customerPhone: "9999999999",
  customerEmail: "asha@example.com",
  deliveryAddress: "1 Main St",
  city: "Chennai",
  state: "TN",
  pincode: "600001",
  deliveryMethod: "delivery",
  items: [{ name: "Truffles", quantity: 2, flavour: "Dark" }],
  amountPaise: 50000,
  amountReceivedPaise: 20000,
};

test("sends owner and customer emails with escaped content", async () => {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); };
  try {
    await sendOrderEmails({ RESEND_API_KEY: "k", LOGIN_FROM_EMAIL: "a@b.com", ADMIN_EMAIL: "owner@b.com" }, order);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].to, ["owner@b.com"]);
  assert.deepEqual(sent[1].to, ["asha@example.com"]);
  assert.match(sent[0].text, /Partially paid/);
  assert.ok(sent[0].html.includes("Asha &lt;b&gt;"));
});

test("sends WhatsApp messages to the customer and the owner when Wassi is configured", async () => {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); };
  try {
    await sendOrderEmails({ WASSI_API_KEY: "k", WASSI_ADMIN_PHONE: "98765 43210" }, order);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, "https://api.wassi.chat/v1/messages");
  assert.equal(sent[0].init.headers.Token, "k");
  assert.equal(sent[0].body.phone, "+919999999999");
  assert.equal(sent[1].body.phone, "+919876543210");
  assert.match(sent[0].body.message, /CC-1/);
});

test("does nothing when email is not configured", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("should not be called"); };
  try {
    await sendOrderEmails({}, order);
  } finally {
    globalThis.fetch = original;
  }
});

test("corporate enquiry is validated and emailed with a clear subject", async () => {
  assert.ok(parseCorporateEnquiry({ website: "spam" }).spam);
  assert.ok(parseCorporateEnquiry({ name: "A" }).error);
  const { enquiry } = parseCorporateEnquiry({ name: "Ravi", company: "Acme", phone: "9876543210", quantity: "100 boxes", occasion: "Festive hampers", email: "r@acme.com", message: "Hi" });
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); };
  try {
    await sendCorporateEnquiry({ RESEND_API_KEY: "k", LOGIN_FROM_EMAIL: "a@b.com", ADMIN_EMAIL: "owner@b.com" }, enquiry);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(sent[0].subject, "Corporate enquiry: Acme - 100 boxes (Festive hampers)");
  assert.equal(sent[0].reply_to, "r@acme.com");
  assert.deepEqual(sent[0].to, ["owner@b.com"]);
});
