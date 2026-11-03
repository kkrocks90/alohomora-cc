import { requireAdmin } from "./admin.js";
import { ensureCatalogue, loadAllProductRows } from "./catalogue.js";
import { triggerSiteRebuild } from "./admin-products.js";

const INPUT_ERROR = /^(Enter|That|Remove|Request|Extra)/;
const MAX_EXTRA_PERCENT = 500;

function result(status, body) {
  return { status, body };
}

function cleanName(value) {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (name.length === 0) throw new Error("Enter a flavour name.");
  if (name.length > 60) throw new Error("Enter a shorter flavour name (60 characters or fewer).");
  return name;
}

function cleanExtra(value) {
  const extra = value === undefined || value === "" ? 0 : Number(value);
  if (!Number.isInteger(extra) || extra < 0 || extra > MAX_EXTRA_PERCENT) {
    throw new Error("Extra percentage must be a whole number from 0 to 500.");
  }
  return extra;
}

function parseList(text) {
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function sameName(first, second) {
  return first.toLocaleLowerCase() === second.toLocaleLowerCase();
}

// Every flavour known to the shop: saved ones plus any used by a product but not yet saved.
export async function listAdminFlavours(env) {
  const rows = await loadAllProductRows(env.ORDERS_DB);
  const { results } = await env.ORDERS_DB
    .prepare("SELECT name, extra_percent FROM flavours ORDER BY sort_order, name")
    .all();
  const flavours = new Map((results ?? []).map((row) => [row.name, { name: row.name, extraPercent: row.extra_percent, productCount: 0 }]));
  for (const row of rows) {
    for (const name of new Set(parseList(row.flavours))) {
      if (!flavours.has(name)) flavours.set(name, { name, extraPercent: 0, productCount: 0 });
      flavours.get(name).productCount += 1;
    }
  }
  return [...flavours.values()];
}

// Saves flavours used by a product so they appear in the flavour manager.
export async function registerFlavours(database, names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return;
  const last = await database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM flavours").first();
  const start = (last?.max_sort ?? 0) + 1;
  await database.batch(
    unique.map((name, index) =>
      database.prepare("INSERT OR IGNORE INTO flavours (name, extra_percent, sort_order) VALUES (?, 0, ?)").bind(name, start + index),
    ),
  );
}

async function readBody(request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 20_000) throw new Error("Request is too large.");
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request must contain valid JSON.");
  }
}

async function applyAction(database, action, body) {
  if (action === "save-all") {
    const items = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
    for (const item of items) await applyAction(database, "update", item);
    return;
  }
  const existing = await listAdminFlavours({ ORDERS_DB: database });
  if (action === "create") {
    const name = cleanName(body?.name);
    const extra = cleanExtra(body?.extraPercent);
    if (existing.some((flavour) => sameName(flavour.name, name))) throw new Error("That flavour already exists.");
    const last = await database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM flavours").first();
    await database
      .prepare("INSERT INTO flavours (name, extra_percent, sort_order) VALUES (?, ?, ?)")
      .bind(name, extra, (last?.max_sort ?? 0) + 1)
      .run();
    return;
  }
  const current = cleanName(body?.name);
  const found = existing.find((flavour) => flavour.name === current);
  if (!found) throw new Error("That flavour could not be found.");
  if (action === "delete") {
    if (found.productCount > 0) {
      throw new Error(
        `Remove it from its ${found.productCount} product${found.productCount === 1 ? "" : "s"} first.`,
      );
    }
    await database.prepare("DELETE FROM flavours WHERE name = ?").bind(current).run();
    return;
  }
  const nextName = body?.newName === undefined ? current : cleanName(body.newName);
  const extra = body?.extraPercent === undefined ? found.extraPercent : cleanExtra(body.extraPercent);
  if (nextName !== current && existing.some((flavour) => flavour.name !== current && sameName(flavour.name, nextName))) {
    throw new Error("That flavour already exists.");
  }
  const last = await database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM flavours").first();
  const statements = [
    database
      .prepare("INSERT OR IGNORE INTO flavours (name, extra_percent, sort_order) VALUES (?, 0, ?)")
      .bind(current, (last?.max_sort ?? 0) + 1),
    database.prepare("UPDATE flavours SET name = ?, extra_percent = ? WHERE name = ?").bind(nextName, extra, current),
  ];
  if (nextName !== current) {
    const { results: productRows } = await database
      .prepare("SELECT product_id, flavours FROM products WHERE flavours != '[]'")
      .all();
    for (const row of productRows ?? []) {
      const list = parseList(row.flavours);
      if (!list.includes(current)) continue;
      const renamed = [...new Set(list.map((flavour) => (flavour === current ? nextName : flavour)))];
      statements.push(database.prepare("UPDATE products SET flavours = ? WHERE product_id = ?").bind(JSON.stringify(renamed), row.product_id));
    }
  }
  await database.batch(statements);
}

// action is "create", "update", "delete" or "save-all"
export async function handleAdminFlavour(request, env, action) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    await applyAction(env.ORDERS_DB, action, body);
    await ensureCatalogue(env, { force: true });
    const flavours = await listAdminFlavours(env);
    const rebuildTriggered = await triggerSiteRebuild(env);
    return result(200, { flavours, rebuildTriggered });
  } catch (error) {
    if (error instanceof Error && INPUT_ERROR.test(error.message)) return result(400, { error: error.message });
    console.error("Could not save the flavour.", error);
    return result(503, { error: "The flavour could not be saved right now. Please try again." });
  }
}
