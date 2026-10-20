import products from "../src/data/products.json" with { type: "json" };
import extraCategories from "../src/data/categories.json" with { type: "json" };

const productById = new Map(products.map((product) => [product.id, product]));
const categories = [...new Set([...products.flatMap((product) => [product.tag, ...(product.extraTags ?? [])]), ...extraCategories])];
const RESERVATION_MINUTES = 30;

function validDate(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function validateCode(value) {
  if (typeof value !== "string") throw new Error("Enter a promo code.");
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,32}$/.test(code)) throw new Error("Enter a valid promo code.");
  return code;
}

export function calculateSubtotal(items) {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity * 100, 0);
}

export async function quotePromo(database, codeValue, email, items, now = new Date()) {
  const code = validateCode(codeValue);
  const promo = await database.prepare("SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE").bind(code).first();
  if (!promo) throw new Error("That promo code was not found.");
  if (!promo.active) throw new Error("That promo code is no longer active.");
  const today = now.toISOString().slice(0, 10);
  if (promo.end_date && promo.end_date < today) throw new Error("That promo code has expired.");

  const subtotalPaise = calculateSubtotal(items);
  let eligibleSubtotalPaise = subtotalPaise;
  if (promo.type === "percentage") {
    if (promo.target_type === "product") {
      eligibleSubtotalPaise = items
        .filter((item) => item.product.id === promo.target_value)
        .reduce((sum, item) => sum + item.product.price * item.quantity * 100, 0);
    } else if (promo.target_type === "category") {
      eligibleSubtotalPaise = items
        .filter((item) => [item.product.tag, ...(item.product.extraTags ?? [])].includes(promo.target_value))
        .reduce((sum, item) => sum + item.product.price * item.quantity * 100, 0);
    } else if (promo.target_type !== "all") {
      throw new Error("That promo code has invalid targeting.");
    }
    if (eligibleSubtotalPaise === 0) throw new Error("This promo code does not apply to the products in your bag.");
  } else if (promo.type === "fixed") {
    if (!Number.isSafeInteger(promo.minimum_subtotal_paise) ||
        subtotalPaise <= promo.minimum_subtotal_paise) {
      throw new Error(`Your product subtotal must be greater than ₹${promo.minimum_subtotal_paise / 100} to use this code.`);
    }
  } else {
    throw new Error("That promo code has invalid discount settings.");
  }

  const activeReservation = await database.prepare(
    `SELECT reservation_id FROM promo_redemptions
     WHERE promo_id = ? AND customer_email = ? AND status = 'reserved' AND expires_at > ?
     LIMIT 1`,
  ).bind(promo.promo_id, email, now.toISOString()).first();
  if (activeReservation) throw new Error("This code is already reserved for an open checkout on your account.");

  if (promo.max_redemptions !== null) {
    const redemption = await database.prepare(
      `SELECT status FROM promo_redemptions
       WHERE promo_id = ? AND customer_email = ? AND status = 'redeemed'
       LIMIT 1`,
    ).bind(promo.promo_id, email).first();
    if (redemption) throw new Error("This limited-use code has already been redeemed by your account.");
    const usage = await database.prepare(
      `SELECT COUNT(DISTINCT customer_email) AS used
       FROM promo_redemptions
       WHERE promo_id = ? AND (
         status = 'redeemed' OR (status = 'reserved' AND expires_at > ?)
       )`,
    ).bind(promo.promo_id, now.toISOString()).first();
    if (Number(usage?.used ?? 0) >= promo.max_redemptions) {
      throw new Error("That promo code has reached its redemption limit.");
    }
  }

  const rawDiscount = promo.type === "percentage"
    ? Math.floor(eligibleSubtotalPaise * promo.percentage / 100)
    : promo.amount_paise;
  const discountPaise = Math.min(subtotalPaise, rawDiscount);
  return {
    promoId: promo.promo_id,
    code: promo.code,
    name: promo.name,
    type: promo.type,
    targetType: promo.target_type,
    targetValue: promo.target_value,
    percentage: promo.percentage,
    amountPaise: promo.amount_paise,
    minimumSubtotalPaise: promo.minimum_subtotal_paise,
    maxRedemptions: promo.max_redemptions,
    subtotalPaise,
    eligibleSubtotalPaise,
    discountPaise,
    payablePaise: subtotalPaise - discountPaise,
  };
}

export async function reservePromo(database, quote, email, orderId, now = new Date()) {
  const reservationId = `pr_${crypto.randomUUID()}`;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.valueOf() + RESERVATION_MINUTES * 60_000).toISOString();
  const reserved = await database.prepare(
    `INSERT INTO promo_redemptions (
       reservation_id, promo_id, customer_email, order_id, promo_code, promo_name,
       subtotal_paise, discount_paise, status, expires_at, created_at
     )
     SELECT ?, p.promo_id, ?, ?, p.code, p.name, ?, ?, 'reserved', ?, ?
     FROM promo_codes p
     WHERE p.promo_id = ? AND p.active = 1
       AND (p.end_date IS NULL OR p.end_date >= ?)
       AND NOT EXISTS (
         SELECT 1 FROM promo_redemptions r
         WHERE r.promo_id = p.promo_id AND r.customer_email = ?
           AND r.status = 'reserved' AND r.expires_at > ?
       )
       AND (
         p.max_redemptions IS NULL OR (
           NOT EXISTS (
             SELECT 1 FROM promo_redemptions r
             WHERE r.promo_id = p.promo_id AND r.customer_email = ?
               AND r.status = 'redeemed'
           )
           AND (
             SELECT COUNT(DISTINCT r.customer_email)
             FROM promo_redemptions r
             WHERE r.promo_id = p.promo_id AND (
               r.status = 'redeemed' OR (r.status = 'reserved' AND r.expires_at > ?)
             )
           ) < p.max_redemptions
         )
       )
     RETURNING reservation_id`,
  ).bind(
    reservationId,
    email,
    orderId,
    quote.subtotalPaise,
    quote.discountPaise,
    expiresAt,
    createdAt,
    quote.promoId,
    createdAt.slice(0, 10),
    email,
    createdAt,
    email,
    createdAt,
  ).first();
  if (!reserved?.reservation_id) {
    throw new Error("That promo code is no longer available. Refresh the code and try again.");
  }
  return { reservationId, expiresAt };
}

export async function getPromoReservation(database, reservationId) {
  if (typeof reservationId !== "string" || !/^pr_[0-9a-f-]{36}$/i.test(reservationId)) return null;
  return database.prepare(
    `SELECT r.*, p.max_redemptions
     FROM promo_redemptions r
     JOIN promo_codes p ON p.promo_id = r.promo_id
     WHERE r.reservation_id = ?`,
  ).bind(reservationId).first();
}

export async function getPromoReservationForOrder(database, orderId) {
  return database.prepare(
    `SELECT r.*, p.max_redemptions
     FROM promo_redemptions r
     JOIN promo_codes p ON p.promo_id = r.promo_id
     WHERE r.order_id = ?`,
  ).bind(orderId).first();
}

export function preparePromoRedemption(database, reservation, orderId, email, now = new Date()) {
  if (!reservation || reservation.order_id !== orderId || reservation.customer_email !== email) {
    throw new Error("The promo reservation does not match this order.");
  }
  return database.prepare(
    `UPDATE promo_redemptions
     SET status = 'redeemed', expires_at = NULL
     WHERE reservation_id = ? AND order_id = ? AND customer_email = ?
       AND (
         status = 'redeemed' OR (
           status = 'reserved' AND expires_at > ? AND (
             (SELECT max_redemptions FROM promo_codes p
              WHERE p.promo_id = promo_redemptions.promo_id) IS NULL OR (
               NOT EXISTS (
                 SELECT 1 FROM promo_redemptions prior
                 WHERE prior.promo_id = promo_redemptions.promo_id
                   AND prior.customer_email = ? AND prior.status = 'redeemed'
                   AND prior.reservation_id <> promo_redemptions.reservation_id
               )
               AND (
                 SELECT COUNT(DISTINCT other.customer_email)
                 FROM promo_redemptions other
                 WHERE other.promo_id = promo_redemptions.promo_id
                   AND (
                     other.status = 'redeemed' OR
                     (other.status = 'reserved' AND other.expires_at > ?)
                   )
               ) <= (SELECT max_redemptions FROM promo_codes p
                     WHERE p.promo_id = promo_redemptions.promo_id)
             )
           )
         )
       )
     RETURNING reservation_id`,
  ).bind(
    reservation.reservation_id,
    orderId,
    email,
    now.toISOString(),
    email,
    now.toISOString(),
  );
}

export async function releasePromoReservation(database, reservationId, email) {
  if (typeof reservationId !== "string" || !/^pr_[0-9a-f-]{36}$/i.test(reservationId)) return false;
  const released = await database.prepare(
    `UPDATE promo_redemptions SET status = 'released', expires_at = NULL
     WHERE reservation_id = ? AND customer_email = ? AND status = 'reserved'
     RETURNING reservation_id`,
  ).bind(reservationId, email).first();
  return released?.reservation_id === reservationId;
}

export function validatePromoDefinition(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) throw new Error("Enter a promo name up to 80 characters.");
  if (body?.type === "percentage") {
    const percentage = Number(body.percentage);
    const targetType = body.targetType;
    const targetValue = typeof body.targetValue === "string" ? body.targetValue : "";
    if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) {
      throw new Error("Enter a percentage discount from 1 to 100.");
    }
    if (
      targetType !== "all" &&
      !(targetType === "product" && productById.has(targetValue)) &&
      !(targetType === "category" && categories.includes(targetValue))
    ) throw new Error("Choose all products, a valid product, or a valid category.");
    return {
      name,
      type: "percentage",
      percentage,
      targetType,
      targetValue: targetType === "all" ? "" : targetValue,
      amountPaise: null,
      minimumSubtotalPaise: null,
    };
  }
  if (body?.type === "fixed") {
    const amountRupees = Number(body.amountRupees);
    const minimumRupees = Number(body.minimumRupees);
    if (!Number.isSafeInteger(amountRupees) || amountRupees < 1 || amountRupees > 1_000_000) {
      throw new Error("Enter a fixed discount from ₹1 to ₹10,00,000.");
    }
    if (!Number.isSafeInteger(minimumRupees) || minimumRupees < 0 || minimumRupees > 1_000_000) {
      throw new Error("Enter a minimum product subtotal from ₹0 to ₹10,00,000.");
    }
    return {
      name,
      type: "fixed",
      percentage: null,
      targetType: null,
      targetValue: null,
      amountPaise: amountRupees * 100,
      minimumSubtotalPaise: minimumRupees * 100,
    };
  }
  throw new Error("Choose a valid promo type.");
}

export function validatePromoLimits(body) {
  let maxRedemptions = null;
  if (body?.maxRedemptions !== "" && body?.maxRedemptions !== undefined && body?.maxRedemptions !== null) {
    maxRedemptions = Number(body.maxRedemptions);
    if (!Number.isSafeInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1_000_000) {
      throw new Error("Enter a redemption limit from 1 to 1,000,000 or leave it blank.");
    }
  }
  let endDate = null;
  if (body?.endDate !== "" && body?.endDate !== undefined && body?.endDate !== null) {
    if (!validDate(body.endDate)) throw new Error("Enter a valid promo end date.");
    endDate = body.endDate;
  }
  return { maxRedemptions, endDate };
}

export function getPromoCategories() {
  return categories;
}

export async function getFeaturedPromo(database, now = new Date()) {
  const promos = await database.prepare(
    `SELECT p.name, p.code, p.type, p.percentage, p.target_type, p.target_value,
            p.amount_paise, p.minimum_subtotal_paise, p.end_date
     FROM promo_codes p
     WHERE p.active = 1
       AND (p.end_date IS NULL OR p.end_date >= ?)
       AND (
         p.max_redemptions IS NULL OR (
           SELECT COUNT(DISTINCT r.customer_email)
           FROM promo_redemptions r
           WHERE r.promo_id = p.promo_id AND (
             r.status = 'redeemed' OR (r.status = 'reserved' AND r.expires_at > ?)
           )
         ) < p.max_redemptions
       )`,
  ).bind(now.toISOString().slice(0, 10), now.toISOString()).all();
  if (promos.results.length === 0) return null;

  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % promos.results.length;
  const promo = promos.results[randomIndex];
  return {
    name: promo.name,
    code: promo.code,
    type: promo.type,
    percentage: promo.percentage,
    targetType: promo.target_type,
    targetLabel: promo.target_type === "product"
      ? productById.get(promo.target_value)?.name ?? promo.target_value
      : promo.target_value ?? "",
    amountPaise: promo.amount_paise,
    minimumSubtotalPaise: promo.minimum_subtotal_paise,
    endDate: promo.end_date ?? "",
  };
}
