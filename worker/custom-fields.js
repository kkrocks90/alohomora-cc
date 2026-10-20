import products from "../src/data/products.json" with { type: "json" };

export const FIELD_SCOPES = ["product", "checkout"];
export const FIELD_TYPES = ["text", "textarea", "number", "date", "dropdown", "radio", "checkboxes", "checkbox"];
const OPTION_TYPES = ["dropdown", "radio", "checkboxes"];
const MAX_FIELDS = 40;
const MAX_OPTIONS = 30;
const TEXT_LIMIT = 200;
const TEXTAREA_LIMIT = 500;
const APPLIES_MODES = ["all", "products", "categories"];
const productById = new Map(products.map((product) => [product.id, product]));

function boundedText(value, maximum, label, { required = false } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && text.length === 0) throw new Error(`Enter a ${label}.`);
  if (text.length > maximum) throw new Error(`The ${label} must be ${maximum} characters or fewer.`);
  return text;
}

function optionalNumber(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000_000) throw new Error(`Enter a valid ${label}.`);
  return number;
}

export function validateFieldDefinition(body, categories) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Field details are missing.");
  const scope = body.scope;
  if (!FIELD_SCOPES.includes(scope)) throw new Error("Choose where this field appears.");
  const type = body.type;
  if (!FIELD_TYPES.includes(type)) throw new Error("Choose a valid field type.");
  const label = boundedText(body.label, 80, "field label", { required: true });
  const config = {};
  if (OPTION_TYPES.includes(type)) {
    const rawOptions = Array.isArray(body.options)
      ? body.options
      : typeof body.options === "string" ? body.options.split(/\r?\n/) : [];
    const options = [];
    for (const raw of rawOptions) {
      const option = boundedText(raw, 60, "option");
      if (option && !options.includes(option)) options.push(option);
    }
    if (options.length === 0) throw new Error("Add at least one option for this field.");
    if (options.length > MAX_OPTIONS) throw new Error(`Add no more than ${MAX_OPTIONS} options.`);
    config.options = options;
  }
  if (type === "number" || type === "text" || type === "textarea") {
    const isNumber = type === "number";
    const min = optionalNumber(body.min, isNumber ? "minimum value" : "minimum length");
    const max = optionalNumber(body.max, isNumber ? "maximum value" : "maximum length");
    if (!isNumber && [min, max].some((limit) => limit !== null && (!Number.isInteger(limit) || limit < 0))) {
      throw new Error("Text length limits must be whole numbers.");
    }
    if (min !== null && max !== null && min > max) throw new Error("The minimum value cannot be greater than the maximum.");
    if (min !== null) config.min = min;
    if (max !== null) config.max = max;
  }
  if (type === "date" && body.futureOnly === true) config.futureOnly = true;
  const appliesTo = { mode: "all", values: [] };
  if (scope === "product") {
    const mode = body.appliesTo?.mode ?? "all";
    if (!APPLIES_MODES.includes(mode)) throw new Error("Choose which products this field applies to.");
    appliesTo.mode = mode;
    if (mode !== "all") {
      const values = Array.isArray(body.appliesTo?.values)
        ? [...new Set(body.appliesTo.values.filter((value) => typeof value === "string"))]
        : [];
      if (values.length === 0) throw new Error(`Choose at least one ${mode === "products" ? "product" : "category"}.`);
      const known = mode === "products" ? (id) => productById.has(id) : (name) => categories.includes(name);
      if (!values.every(known)) throw new Error(`One of the chosen ${mode} is not available.`);
      appliesTo.values = values;
    }
  }
  const sortOrder = Number.isInteger(Number(body.sortOrder)) ? Math.max(-1000, Math.min(1000, Number(body.sortOrder))) : 0;
  return {
    scope,
    type,
    label,
    config,
    required: body.required === true,
    placeholder: boundedText(body.placeholder, 80, "placeholder"),
    helpText: boundedText(body.helpText, 200, "help text"),
    appliesTo,
    sortOrder,
  };
}

export function rowToField(row) {
  let config = {};
  let appliesTo = { mode: "all", values: [] };
  try { config = JSON.parse(row.config_json || "{}"); } catch { /* keep defaults */ }
  try { appliesTo = JSON.parse(row.applies_to_json || "{}"); } catch { /* keep defaults */ }
  return {
    id: row.field_id,
    scope: row.scope,
    label: row.label,
    type: row.type,
    options: Array.isArray(config.options) ? config.options : [],
    min: typeof config.min === "number" ? config.min : null,
    max: typeof config.max === "number" ? config.max : null,
    futureOnly: config.futureOnly === true,
    required: row.required === 1,
    placeholder: row.placeholder ?? "",
    helpText: row.help_text ?? "",
    appliesTo: {
      mode: APPLIES_MODES.includes(appliesTo.mode) ? appliesTo.mode : "all",
      values: Array.isArray(appliesTo.values) ? appliesTo.values : [],
    },
    sortOrder: row.sort_order ?? 0,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

const isMissingTable = (error) => error instanceof Error && /no such (table|column)/i.test(error.message);

export async function listCustomFields(database, { activeOnly = false } = {}) {
  try {
    const { results } = await database
      .prepare(
        `SELECT field_id, scope, label, type, config_json, required, placeholder, help_text,
                applies_to_json, sort_order, active, created_at
         FROM custom_fields
         WHERE active >= ?
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .bind(activeOnly ? 1 : 0)
      .all();
    return results.map(rowToField);
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export function countCustomFields(fields) {
  return fields.length;
}

export function assertFieldCapacity(fields) {
  if (fields.length >= MAX_FIELDS) throw new Error(`You can have up to ${MAX_FIELDS} custom fields. Delete one first.`);
}

export function fieldAppliesToProduct(field, product) {
  if (field.scope !== "product") return false;
  const { mode, values } = field.appliesTo;
  if (mode === "all") return true;
  if (mode === "products") return values.includes(product.id);
  return values.includes(product.tag) || (product.extraTags ?? []).some((tag) => values.includes(tag));
}

function isEmpty(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function validateAnswer(field, value) {
  switch (field.type) {
    case "text":
    case "textarea": {
      if (typeof value !== "string") throw new Error(`Enter a valid answer for "${field.label}".`);
      const text = value.trim();
      if (text.length > (field.type === "text" ? TEXT_LIMIT : TEXTAREA_LIMIT)) {
        throw new Error(`The answer for "${field.label}" is too long.`);
      }
      if ((field.min !== null && text.length < field.min) || (field.max !== null && text.length > field.max)) {
        const limits = [field.min !== null ? `at least ${field.min}` : "", field.max !== null ? `at most ${field.max}` : ""];
        throw new Error(`The answer for "${field.label}" must be ${limits.filter(Boolean).join(" and ")} characters.`);
      }
      return text;
    }
    case "number": {
      const number = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : NaN);
      if (!Number.isFinite(number) ||
          (field.min !== null && number < field.min) || (field.max !== null && number > field.max)) {
        throw new Error(`Enter a valid number for "${field.label}".`);
      }
      return String(number);
    }
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
        throw new Error(`Choose a valid date for "${field.label}".`);
      }
      if (field.futureOnly && value < new Date().toISOString().slice(0, 10)) {
        throw new Error(`Please choose a date for "${field.label}" that is today or later.`);
      }
      return value;
    }
    case "dropdown":
    case "radio":
      if (typeof value !== "string" || !field.options.includes(value)) {
        throw new Error(`Choose a valid option for "${field.label}".`);
      }
      return value;
    case "checkboxes": {
      if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && field.options.includes(entry))) {
        throw new Error(`Choose valid options for "${field.label}".`);
      }
      return field.options.filter((option) => value.includes(option)).join(", ");
    }
    case "checkbox":
      if (typeof value !== "boolean") throw new Error(`Choose a valid answer for "${field.label}".`);
      return value ? "Yes" : "No";
    default:
      throw new Error("Unsupported custom field.");
  }
}

// Validates submitted answers against the given fields and returns a labelled snapshot.
export function collectAnswers(fields, values) {
  const submitted = values && typeof values === "object" && !Array.isArray(values) ? values : {};
  const answers = [];
  for (const field of fields) {
    const value = submitted[field.id];
    if (field.type === "checkbox") {
      if (field.required && value !== true) throw new Error(`Please tick "${field.label}" to continue.`);
      if (value === undefined) continue;
    } else if (isEmpty(value)) {
      if (field.required) throw new Error(`Please fill in "${field.label}".`);
      continue;
    }
    answers.push({ id: field.id, label: field.label, value: validateAnswer(field, value) });
  }
  return answers;
}

export async function savePendingCustom(database, orderId, payload) {
  await database
    .prepare(
      `INSERT INTO pending_order_custom (order_id, payload_json, created_at) VALUES (?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET payload_json = excluded.payload_json, created_at = excluded.created_at`,
    )
    .bind(orderId, JSON.stringify(payload), new Date().toISOString())
    .run();
}

function cleanSnapshot(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry.id === "string" && typeof entry.label === "string" && typeof entry.value === "string")
    .map(({ id, label, value }) => ({ id, label, value }));
}

export async function loadPendingCustom(database, orderId) {
  let row;
  try {
    row = await database
      .prepare("SELECT payload_json FROM pending_order_custom WHERE order_id = ?")
      .bind(orderId)
      .first();
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload_json);
    return {
      checkout: cleanSnapshot(payload.checkout),
      items: Array.isArray(payload.items) ? payload.items.map(cleanSnapshot) : [],
    };
  } catch {
    return null;
  }
}

export async function deletePendingCustom(database, orderId) {
  try {
    await database.prepare("DELETE FROM pending_order_custom WHERE order_id = ?").bind(orderId).run();
  } catch (error) {
    console.error("Could not clear pending custom answers.", error);
  }
}
