import { requireAdmin } from "./admin.js";

export const FLAT_DISCOUNT_BLOCKS_COUPONS_MESSAGE =
  "Promo codes can't be used while the flat discount is running.";

function toDiscount(row) {
  if (!row) return null;
  return {
    name: row.name,
    percentage: Number(row.percentage),
    active: row.active === 1,
    endDate: row.end_date ?? "",
  };
}

// Returns the saved flat discount (for the admin), or null when none was ever saved.
export async function getFlatDiscount(database) {
  if (!database) return null;
  try {
    const row = await database
      .prepare("SELECT name, percentage, active, end_date FROM flat_discount WHERE id = 1")
      .first();
    return toDiscount(row);
  } catch (error) {
    console.error("Could not read the flat discount.", error);
    return null;
  }
}

// Returns the discount customers get right now, or null.
export async function getActiveFlatDiscount(database, now = new Date()) {
  const discount = await getFlatDiscount(database);
  if (!discount || !discount.active) return null;
  if (discount.endDate && discount.endDate < now.toISOString().slice(0, 10)) return null;
  return discount;
}

export function calculateFlatDiscountPaise(subtotalPaise, discount) {
  return Math.floor((subtotalPaise * discount.percentage) / 100);
}

export function validateFlatDiscount(body) {
  const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > 60) throw new Error("Enter a discount name up to 60 characters.");
  const percentage = Number(body?.percentage);
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 90) {
    throw new Error("Enter a percentage from 1 to 90.");
  }
  let endDate = "";
  if (body?.endDate) {
    if (typeof body.endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate) || Number.isNaN(Date.parse(body.endDate))) {
      throw new Error("Enter a valid end date.");
    }
    endDate = body.endDate;
  }
  return { name, percentage, active: body?.active === true, endDate };
}

export async function saveFlatDiscount(database, body) {
  const discount = validateFlatDiscount(body);
  await database
    .prepare(
      `INSERT INTO flat_discount (id, name, percentage, active, end_date) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, percentage = excluded.percentage,
         active = excluded.active, end_date = excluded.end_date`,
    )
    .bind(discount.name, discount.percentage, discount.active ? 1 : 0, discount.endDate || null)
    .run();
  return discount;
}

export async function handleAdminFlatDiscount(request, env) {
  const text = await request.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 400, body: { error: "Request must contain valid JSON." } };
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const flatDiscount = await saveFlatDiscount(env.ORDERS_DB, body);
    return { status: 200, body: { flatDiscount } };
  } catch (error) {
    if (error instanceof Error && /^Enter/.test(error.message)) return { status: 400, body: { error: error.message } };
    console.error("Could not save the flat discount.", error);
    return { status: 503, body: { error: "The flat discount could not be saved right now. Please try again." } };
  }
}
