import { requireAdmin } from "./admin.js";
import { triggerSiteRebuild } from "./admin-products.js";
import bundledFaqs from "../src/data/faqs.json" with { type: "json" };

const INPUT_ERROR = /^(Enter|Add|Request)/;
const MAX_ITEMS = 30;
const MAX_QUESTION = 200;
const MAX_ANSWER = 1500;

function result(status, body) {
  return { status, body };
}

function clean(value) {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").trim() : "";
}

export function cleanFaqs(items) {
  const list = Array.isArray(items) ? items : [];
  const faqs = [];
  for (const item of list) {
    const question = clean(item?.question);
    const answer = clean(item?.answer);
    if (!question && !answer) continue;
    if (!question || !answer) throw new Error("Enter both a question and an answer for every FAQ.");
    if (question.length > MAX_QUESTION) throw new Error(`Enter a shorter question (${MAX_QUESTION} characters or fewer).`);
    if (answer.length > MAX_ANSWER) throw new Error(`Enter a shorter answer (${MAX_ANSWER} characters or fewer).`);
    faqs.push({ question, answer });
  }
  if (faqs.length > MAX_ITEMS) throw new Error(`Add no more than ${MAX_ITEMS} FAQs.`);
  return faqs;
}

export async function listFaqs(env) {
  try {
    const row = await env.ORDERS_DB.prepare("SELECT items FROM faq_settings WHERE id = 1").first();
    if (!row) return bundledFaqs;
    const items = JSON.parse(row.items);
    return Array.isArray(items) ? cleanFaqs(items) : bundledFaqs;
  } catch {
    return bundledFaqs;
  }
}

async function readBody(request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 100_000) throw new Error("Request is too large.");
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request must contain valid JSON.");
  }
}

// action is "list" or "save"
export async function handleAdminFaqs(request, env, action) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    if (action === "list") return result(200, { faqs: await listFaqs(env) });
    const faqs = cleanFaqs(body?.items);
    await env.ORDERS_DB
      .prepare(
        `INSERT INTO faq_settings (id, items, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(faqs), new Date().toISOString())
      .run();
    const rebuildTriggered = await triggerSiteRebuild(env);
    return result(200, { faqs, rebuildTriggered });
  } catch (error) {
    if (error instanceof Error && INPUT_ERROR.test(error.message)) return result(400, { error: error.message });
    console.error("Could not save the FAQs.", error);
    return result(503, { error: "The FAQs could not be saved right now. Please try again." });
  }
}
