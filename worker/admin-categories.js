import { requireAdmin } from "./admin.js";
import { ensureCatalogue, loadAllProductRows } from "./catalogue.js";

const INPUT_ERROR = /^(Enter|That|Move|Request|A promo|A custom)/;

function result(status, body) {
  return { status, body };
}

function cleanName(value) {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (name.length === 0) throw new Error("Enter a category name.");
  if (name.length > 60) throw new Error("Enter a shorter category name (60 characters or fewer).");
  return name;
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

// Every category known to the shop: saved ones plus any used by a product but not yet saved.
export async function listAdminCategories(env) {
  const rows = await loadAllProductRows(env.ORDERS_DB);
  let saved = [];
  try {
    const { results } = await env.ORDERS_DB
      .prepare("SELECT name, hidden FROM catalogue_categories ORDER BY sort_order, name")
      .all();
    saved = results ?? [];
  } catch {
    const { results } = await env.ORDERS_DB.prepare("SELECT name FROM catalogue_categories").all();
    saved = results ?? [];
  }
  const categories = new Map(saved.map((row) => [row.name, { name: row.name, hidden: row.hidden === 1, productCount: 0 }]));
  for (const row of rows) {
    for (const name of new Set([row.tag, ...parseList(row.extra_tags)])) {
      if (!categories.has(name)) categories.set(name, { name, hidden: false, productCount: 0 });
      categories.get(name).productCount += 1;
    }
  }
  return [...categories.values()].sort((first, second) => first.name.localeCompare(second.name));
}

// Saves categories used by a product so they appear in the category manager.
export async function registerCategories(database, names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return;
  const last = await database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM catalogue_categories").first();
  const start = (last?.max_sort ?? 0) + 1;
  const known = await database.prepare("SELECT name FROM catalogue_categories").all();
  const existing = new Set((known.results ?? []).map((row) => row.name.toLocaleLowerCase()));
  const missing = unique.filter((name) => !existing.has(name.toLocaleLowerCase()));
  if (missing.length === 0) return;
  await database.batch(
    missing.map((name, index) =>
      database.prepare("INSERT OR IGNORE INTO catalogue_categories (name, sort_order) VALUES (?, ?)").bind(name, start + index),
    ),
  );
}

async function ensureSaved(database, name) {
  const found = await database.prepare("SELECT name FROM catalogue_categories WHERE name = ?").bind(name).first();
  if (found) return;
  const last = await database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM catalogue_categories").first();
  await database
    .prepare("INSERT OR IGNORE INTO catalogue_categories (name, sort_order) VALUES (?, ?)")
    .bind(name, (last?.max_sort ?? 0) + 1)
    .run();
}

async function renameStatements(database, from, to) {
  const statements = [
    database.prepare("UPDATE catalogue_categories SET name = ? WHERE name = ?").bind(to, from),
    database.prepare("UPDATE products SET tag = ? WHERE tag = ?").bind(to, from),
    database
      .prepare("UPDATE promo_codes SET target_value = ? WHERE target_type = 'category' AND target_value = ?")
      .bind(to, from),
  ];
  const { results: productRows } = await database
    .prepare("SELECT product_id, tag, extra_tags FROM products WHERE extra_tags != '[]'")
    .all();
  for (const row of productRows ?? []) {
    const extras = parseList(row.extra_tags);
    if (!extras.includes(from)) continue;
    const tag = row.tag === from ? to : row.tag;
    const renamed = [...new Set(extras.map((extra) => (extra === from ? to : extra)))].filter((extra) => extra !== tag);
    statements.push(database.prepare("UPDATE products SET extra_tags = ? WHERE product_id = ?").bind(JSON.stringify(renamed), row.product_id));
  }
  const { results: fieldRows } = await database.prepare("SELECT field_id, applies_to_json FROM custom_fields").all();
  for (const row of fieldRows ?? []) {
    let appliesTo;
    try {
      appliesTo = JSON.parse(row.applies_to_json || "{}");
    } catch {
      continue;
    }
    if (appliesTo.mode !== "categories" || !Array.isArray(appliesTo.values) || !appliesTo.values.includes(from)) continue;
    const values = [...new Set(appliesTo.values.map((value) => (value === from ? to : value)))];
    statements.push(
      database
        .prepare("UPDATE custom_fields SET applies_to_json = ? WHERE field_id = ?")
        .bind(JSON.stringify({ ...appliesTo, values }), row.field_id),
    );
  }
  return statements;
}

async function usageOf(database, name) {
  const { results: productRows } = await database.prepare("SELECT tag, extra_tags FROM products").all();
  const productCount = (productRows ?? []).filter((row) => row.tag === name || parseList(row.extra_tags).includes(name)).length;
  const promo = await database
    .prepare("SELECT COUNT(*) AS total FROM promo_codes WHERE target_type = 'category' AND target_value = ?")
    .bind(name)
    .first();
  const { results: fieldRows } = await database.prepare("SELECT applies_to_json FROM custom_fields").all();
  const fieldCount = (fieldRows ?? []).filter((row) => {
    try {
      const appliesTo = JSON.parse(row.applies_to_json || "{}");
      return appliesTo.mode === "categories" && Array.isArray(appliesTo.values) && appliesTo.values.includes(name);
    } catch {
      return false;
    }
  }).length;
  return { productCount, promoCount: promo?.total ?? 0, fieldCount };
}

async function readBody(request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 2_000) throw new Error("Request is too large.");
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request must contain valid JSON.");
  }
}

async function applyAction(database, action, body) {
  const existing = await listAdminCategoriesFor(database);
  if (action === "create") {
    const name = cleanName(body?.name);
    if (existing.some((category) => sameName(category.name, name))) throw new Error("That category already exists.");
    const last = await database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM catalogue_categories").first();
    await database
      .prepare("INSERT INTO catalogue_categories (name, sort_order, hidden) VALUES (?, ?, ?)")
      .bind(name, (last?.max_sort ?? 0) + 1, body?.hidden === true ? 1 : 0)
      .run();
    return;
  }
  const current = cleanName(body?.name);
  if (!existing.some((category) => category.name === current)) throw new Error("That category could not be found.");
  if (action === "delete") {
    const usage = await usageOf(database, current);
    if (usage.productCount > 0) {
      throw new Error(
        `Move or delete its ${usage.productCount} product${usage.productCount === 1 ? "" : "s"} first, or hide the category instead.`,
      );
    }
    if (usage.promoCount > 0) throw new Error("A promo code targets this category. Change or delete the promo first.");
    if (usage.fieldCount > 0) throw new Error("A custom field is limited to this category. Change the field first.");
    await database.prepare("DELETE FROM catalogue_categories WHERE name = ?").bind(current).run();
    return;
  }
  await ensureSaved(database, current);
  const nextName = body?.newName === undefined ? current : cleanName(body.newName);
  if (nextName !== current && existing.some((category) => category.name !== current && sameName(category.name, nextName))) {
    throw new Error("That category already exists.");
  }
  const statements = nextName === current ? [] : await renameStatements(database, current, nextName);
  if (typeof body?.hidden === "boolean") {
    statements.push(
      database.prepare("UPDATE catalogue_categories SET hidden = ? WHERE name = ?").bind(body.hidden ? 1 : 0, nextName),
    );
  }
  if (statements.length > 0) await database.batch(statements);
}

async function listAdminCategoriesFor(database) {
  return listAdminCategories({ ORDERS_DB: database });
}

// action is "create", "update" or "delete"
export async function handleAdminCategory(request, env, action) {
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
    const categories = await listAdminCategories(env);
    return result(200, { categories });
  } catch (error) {
    if (error instanceof Error && INPUT_ERROR.test(error.message)) return result(400, { error: error.message });
    console.error("Could not save the category.", error);
    return result(503, { error: "The category could not be saved right now. Please try again." });
  }
}
