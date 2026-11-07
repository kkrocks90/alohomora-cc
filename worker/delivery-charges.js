import { requireAdmin } from "./admin.js";
import { getDistanceKm, getRoadDistanceKm, getStoreLocation } from "./delivery.js";
import { PincodeLookupError, lookupPincode } from "./pincode.js";

// A 2-wheeler Porter carries up to 20 kg, so the calculator accepts 50 g to 20 kg.
export const MAX_PREVIEW_WEIGHT_GRAMS = 20000;

// All money values are whole rupees. Pickup is always free.
export const DEFAULT_DELIVERY_SETTINGS = {
  enabled: false,
  storeState: "",
  defaultItemWeightGrams: 500,
  porter: { radiusKm: 30, baseFee: 48, includedKm: 1, perExtraKm: 10 },
  courier: {
    slabGrams: 500,
    sameState: { firstSlabFee: 75, extraSlabFee: 15 },
    otherState: { firstSlabFee: 120, extraSlabFee: 60 },
  },
};

const RUPEE_FIELDS = 100000;

function whole(value, label, { min = 0, max = RUPEE_FIELDS } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Enter a valid ${label} (${min} to ${max}).`);
  }
  return Math.round(number * 100) / 100;
}

export function validateDeliverySettings(body) {
  if (!body || typeof body !== "object") throw new Error("Enter the delivery settings.");
  const porter = body.porter ?? {};
  const courier = body.courier ?? {};
  const storeState = typeof body.storeState === "string" ? body.storeState.replace(/\s+/g, " ").trim() : "";
  if (storeState.length > 60) throw new Error("Enter a store state up to 60 characters.");
  const zone = (value, name) => ({
    firstSlabFee: whole(value?.firstSlabFee, `${name} first-slab charge`),
    extraSlabFee: whole(value?.extraSlabFee, `${name} extra-slab charge`),
  });
  return {
    enabled: body.enabled === true,
    storeState,
    defaultItemWeightGrams: whole(body.defaultItemWeightGrams, "default item weight in grams", { min: 1, max: 50000 }),
    porter: {
      radiusKm: whole(porter.radiusKm, "Porter radius in km", { min: 1, max: 500 }),
      baseFee: whole(porter.baseFee, "Porter base charge"),
      includedKm: whole(porter.includedKm, "Porter included km", { min: 0, max: 500 }),
      perExtraKm: whole(porter.perExtraKm, "Porter per-km charge"),
    },
    courier: {
      slabGrams: whole(courier.slabGrams, "courier weight slab in grams", { min: 50, max: 50000 }),
      sameState: zone(courier.sameState, "same-state courier"),
      otherState: zone(courier.otherState, "other-state courier"),
    },
  };
}

function mergeSettings(saved) {
  try {
    return validateDeliverySettings({ ...DEFAULT_DELIVERY_SETTINGS, ...saved });
  } catch {
    return DEFAULT_DELIVERY_SETTINGS;
  }
}

export async function getDeliverySettings(database) {
  if (!database) return DEFAULT_DELIVERY_SETTINGS;
  try {
    const row = await database.prepare("SELECT config_json FROM delivery_settings WHERE id = 1").first();
    return row ? mergeSettings(JSON.parse(row.config_json)) : DEFAULT_DELIVERY_SETTINGS;
  } catch (error) {
    console.error("Could not read the delivery settings.", error);
    return DEFAULT_DELIVERY_SETTINGS;
  }
}

export async function saveDeliverySettings(database, body) {
  const settings = validateDeliverySettings(body);
  await database
    .prepare(
      `INSERT INTO delivery_settings (id, config_json) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(JSON.stringify(settings))
    .run();
  return settings;
}

// Reads weights such as "250 g", "0.5 kg" or "1.2kg". Returns grams, or null when unknown.
export function parseWeightGrams(text) {
  if (typeof text !== "string") return null;
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|gram|grams)\b/i);
  if (!match) return null;
  const grams = Number(match[1]) * (match[2].toLowerCase().startsWith("k") ? 1000 : 1);
  return grams > 0 ? Math.round(grams) : null;
}

export function totalWeightGrams(items, settings) {
  return items.reduce(
    (sum, item) => sum + (parseWeightGrams(item.weight) ?? settings.defaultItemWeightGrams) * item.quantity,
    0,
  );
}

function sameState(first, second) {
  return Boolean(first && second && first.trim().toLowerCase() === second.trim().toLowerCase());
}

// method: "pickup" | "delivery". Returns { rupees, kind, detail }.
export function calculateDeliveryCharge(settings, { method, distanceKm, customerState, weightGrams }) {
  if (method === "pickup") return { rupees: 0, kind: "pickup", detail: "Pickup is free." };
  if (!settings.enabled) return { rupees: 0, kind: "disabled", detail: "Delivery charges are turned off." };

  if (distanceKm <= settings.porter.radiusKm) {
    const { baseFee, includedKm, perExtraKm } = settings.porter;
    const extraKm = Math.max(0, Math.ceil(distanceKm - includedKm));
    return {
      rupees: baseFee + extraKm * perExtraKm,
      kind: "porter",
      detail: `Porter: ₹${baseFee} base (first ${includedKm} km) + ${extraKm} extra km × ₹${perExtraKm}.`,
    };
  }

  const zone = sameState(customerState, settings.storeState) ? settings.courier.sameState : settings.courier.otherState;
  const zoneName = zone === settings.courier.sameState ? "same state" : "other state";
  const { slabGrams } = settings.courier;
  const slabs = Math.max(1, Math.ceil(weightGrams / slabGrams));
  return {
    rupees: zone.firstSlabFee + (slabs - 1) * zone.extraSlabFee,
    kind: "courier",
    detail: `Courier (${zoneName}): ₹${zone.firstSlabFee} first ${slabGrams} g + ${slabs - 1} extra slab(s) × ₹${zone.extraSlabFee}.`,
  };
}

class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Works out the charge for a PIN code and weight using unsaved settings from the admin form.
export async function previewDeliveryCharge(env, body, lookup = lookupPincode) {
  const settings = validateDeliverySettings(body.settings);
  const weightGrams = whole(body.weightGrams, "weight in grams", { min: 50, max: MAX_PREVIEW_WEIGHT_GRAMS });
  const method = body.method === "pickup" ? "pickup" : "delivery";
  let distanceKm = 0;
  let place = null;
  let distanceSource = "";
  if (method === "delivery") {
    const storeLocation = getStoreLocation(env);
    if (!storeLocation) throw new InputError("The store location is not configured on the server.", 503);
    try {
      place = await lookup(typeof body.pincode === "string" ? body.pincode : "", env);
    } catch (error) {
      if (error instanceof PincodeLookupError) throw new InputError(error.message, error.status);
      throw error;
    }
    const roadKm = await getRoadDistanceKm(env, storeLocation, place);
    distanceSource = roadKm === null ? "straight-line" : "road";
    distanceKm = roadKm ?? getDistanceKm(storeLocation, place);
  }
  // Preview ignores the on/off switch so rules can be tested while charges are disabled.
  const charge = calculateDeliveryCharge({ ...settings, enabled: true }, {
    method,
    distanceKm,
    customerState: place?.state ?? "",
    weightGrams,
  });
  return {
    charge,
    distanceKm: Math.round(distanceKm * 10) / 10,
    distanceSource,
    place: place ? { pincode: place.pincode, city: place.city, state: place.state } : null,
  };
}

async function readJson(request) {
  try {
    return JSON.parse(await request.text());
  } catch {
    return null;
  }
}

export async function handleAdminDeliverySettings(request, env, action, lookup = lookupPincode) {
  const body = await readJson(request);
  if (body === null) return { status: 400, body: { error: "Request must contain valid JSON." } };
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    if (action === "preview") return { status: 200, body: await previewDeliveryCharge(env, body, lookup) };
    return { status: 200, body: { deliverySettings: await saveDeliverySettings(env.ORDERS_DB, body) } };
  } catch (error) {
    if (error instanceof InputError || (error instanceof Error && /^Enter/.test(error.message))) {
      return { status: error instanceof InputError ? error.status : 400, body: { error: error.message } };
    }
    console.error("Could not save the delivery settings.", error);
    return { status: 503, body: { error: "The delivery settings could not be saved right now. Please try again." } };
  }
}
