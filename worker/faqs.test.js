import assert from "node:assert/strict";
import test from "node:test";
import { cleanFaqs, listFaqs } from "./faqs.js";

test("cleanFaqs trims, drops blank rows and keeps order", () => {
  const faqs = cleanFaqs([
    { question: "  Q1 ", answer: " A1 " },
    { question: "", answer: "" },
    { question: "Q2", answer: "A2" },
  ]);
  assert.deepEqual(faqs, [
    { question: "Q1", answer: "A1" },
    { question: "Q2", answer: "A2" },
  ]);
});

test("cleanFaqs rejects a question without an answer", () => {
  assert.throws(() => cleanFaqs([{ question: "Q", answer: "" }]), /both a question and an answer/);
});

test("cleanFaqs rejects too many items and overlong text", () => {
  assert.throws(() => cleanFaqs(Array.from({ length: 31 }, () => ({ question: "Q", answer: "A" }))), /no more than 30/);
  assert.throws(() => cleanFaqs([{ question: "Q".repeat(201), answer: "A" }]), /shorter question/);
});

test("listFaqs returns saved FAQs, an empty list, or the defaults", async () => {
  const dbWith = (row) => ({ ORDERS_DB: { prepare: () => ({ first: async () => row }) } });
  assert.deepEqual(await listFaqs(dbWith({ items: JSON.stringify([{ question: "Q", answer: "A" }]) })), [{ question: "Q", answer: "A" }]);
  assert.deepEqual(await listFaqs(dbWith({ items: "[]" })), []);
  assert.ok((await listFaqs(dbWith(null))).length > 0);
});
