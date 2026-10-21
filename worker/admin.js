import products from "../src/data/products.json" with { type: "json" };
import { authenticatedEmail, normalizeCustomerEmail } from "./customer-auth.js";
import { generateOrderId } from "./order-id.js";
import { assertFieldCapacity, listCustomFields, validateFieldDefinition } from "./custom-fields.js";
import { getPromoCategories, validatePromoDefinition, validatePromoLimits } from "./promos.js";

export const ORDER_STATUSES = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const DELIVERY_METHODS = ["Porter (manual booking)", "Courier (manual booking)"];
const productById = new Map(products.map((product) => [product.id, product]));
const phonePattern = /^\+?[0-9\s()-]{7,20}$/;

function result(status, body) {
  return { status, body };
}

function requiredText(value, maximum, label) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > maximum) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return value.trim();
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

async function requireAdmin(request, env) {
  const adminEmail = normalizeCustomerEmail(env.ADMIN_EMAIL);
  if (!env.ORDERS_DB || !adminEmail || typeof env.AUTH_TOKEN_SECRET !== "string") {
    return { error: result(503, { error: "Admin access is not configured." }) };
  }
  const email = await authenticatedEmail(request, env);
  if (!email) return { error: result(401, { error: "Please sign in to continue." }) };
  if (email !== adminEmail) return { error: result(403, { error: "This account does not have admin access." }) };
  return { email };
}

export async function getAdminData(request, env) {
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const [ordersResult, customersResult, promosResult, customFields, customProducts] = await Promise.all([
      env.ORDERS_DB
        .prepare(
          `SELECT order_id, razorpay_order_id, payment_id, payment_status, payment_method, order_status,
                  customer_id, customer_name, customer_phone, customer_email,
                  delivery_address, city, state, pincode, items_json, custom_json, amount_paise, product_subtotal_paise,
                  discount_paise, promo_code, currency, delivery_method, event_date, created_at, payment_link_url
           FROM orders
           ORDER BY created_at DESC`,
        )
        .all(),
      env.ORDERS_DB
        .prepare(
          `SELECT customer_id, customer_name, customer_phone, customer_email,
                  default_address, city, state, pincode, created_at, updated_at
           FROM customers
           ORDER BY CASE WHEN customer_name = '' THEN customer_email ELSE customer_name END COLLATE NOCASE`,
        )
        .all(),
      env.ORDERS_DB
        .prepare(
          `SELECT p.promo_id, p.name, p.code, p.type, p.percentage, p.target_type,
                  p.target_value, p.amount_paise, p.minimum_subtotal_paise,
                  p.max_redemptions, p.end_date, p.active, p.created_at,
                  COUNT(DISTINCT CASE WHEN r.status = 'redeemed' THEN r.customer_email END) AS redeemed_count
           FROM promo_codes p
           LEFT JOIN promo_redemptions r ON r.promo_id = p.promo_id
           GROUP BY p.promo_id
           ORDER BY p.created_at DESC`,
        )
        .all(),
      listCustomFields(env.ORDERS_DB),
      listCustomProducts(env.ORDERS_DB),
    ]);
    return result(200, {
      email: access.email,
      orders: ordersResult.results.map((order) => ({
        orderId: order.order_id,
        razorpayOrderId: order.razorpay_order_id ?? null,
        paymentId: order.payment_id,
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
        orderStatus: order.order_status,
        customerId: order.customer_id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        customerEmail: order.customer_email,
        deliveryAddress: order.delivery_address,
        city: order.city ?? "",
        state: order.state ?? "",
        pincode: order.pincode ?? "",
        items: JSON.parse(order.items_json),
        customFields: parseSnapshot(order.custom_json),
        amountPaise: order.amount_paise,
        productSubtotalPaise: order.product_subtotal_paise ?? order.amount_paise,
        discountPaise: order.discount_paise ?? 0,
        promoCode: order.promo_code ?? "",
        currency: order.currency,
        deliveryMethod: order.delivery_method,
        eventDate: order.event_date ?? "",
        createdAt: order.created_at,
        paymentLinkUrl: order.payment_link_url ?? "",
      })),
      customers: customersResult.results.map((customer) => ({
        customerId: customer.customer_id,
        name: customer.customer_name,
        phone: customer.customer_phone,
        email: customer.customer_email,
        address: customer.default_address,
        city: customer.city ?? "",
        state: customer.state ?? "",
        pincode: customer.pincode ?? "",
        createdAt: customer.created_at,
        updatedAt: customer.updated_at,
      })),
      orderStatuses: ORDER_STATUSES,
      products: products.map(({ id, name, price, flavours }) => ({ id, name, price, flavours })),
      categories: getPromoCategories(),
      customFields,
      customProducts,
      promos: promosResult.results.map((promo) => ({
        promoId: promo.promo_id,
        name: promo.name,
        code: promo.code,
        type: promo.type,
        percentage: promo.percentage,
        targetType: promo.target_type,
        targetValue: promo.target_value,
        amountPaise: promo.amount_paise,
        minimumSubtotalPaise: promo.minimum_subtotal_paise,
        maxRedemptions: promo.max_redemptions,
        redeemedCount: promo.redeemed_count,
        endDate: promo.end_date ?? "",
        active: promo.active === 1,
        createdAt: promo.created_at,
      })),
    });
  } catch (error) {
    console.error("Could not load the admin dashboard.", error);
    return result(503, { error: "The admin dashboard is temporarily unavailable." });
  }
}

function parseSnapshot(text) {
  if (!text) return [];
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function generatePromoCode() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `CC${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

export async function createAdminPromo(request, env) {
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      return result(400, { error: error.message });
    }
    try {
      const access = await requireAdmin(request, env);
      if (access.error) return access.error;
      let definition;
      let limits;
      try {
        definition = validatePromoDefinition(body);
        limits = validatePromoLimits(body);
      } catch (error) {
        return result(400, { error: error.message });
      }
      const promoId = `promo_${crypto.randomUUID()}`;
      const code = generatePromoCode();
      const createdAt = new Date().toISOString();
      await env.ORDERS_DB.prepare(
        `INSERT INTO promo_codes (
          promo_id, name, code, type, percentage, target_type, target_value,
          amount_paise, minimum_subtotal_paise, max_redemptions, end_date, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).bind(
        promoId,
        definition.name,
        code,
        definition.type,
        definition.percentage,
        definition.targetType,
        definition.targetValue,
        definition.amountPaise,
        definition.minimumSubtotalPaise,
        limits.maxRedemptions,
        limits.endDate,
        createdAt,
      ).run();
      return result(201, {
        promo: {
          promoId,
          name: definition.name,
          code,
          type: definition.type,
          percentage: definition.percentage,
          targetType: definition.targetType,
          targetValue: definition.targetValue,
          amountPaise: definition.amountPaise,
          minimumSubtotalPaise: definition.minimumSubtotalPaise,
          maxRedemptions: limits.maxRedemptions,
          redeemedCount: 0,
          endDate: limits.endDate ?? "",
          active: true,
          createdAt,
        },
      });
    } catch (error) {
      console.error("Could not create an admin promo code.", error);
      return result(503, { error: "The promo code could not be created right now. Please try again." });
    }
}

export async function updateAdminPromo(request, env) {
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      return result(400, { error: error.message });
    }
    try {
      const access = await requireAdmin(request, env);
      if (access.error) return access.error;
      const promoId = requiredText(body?.promoId, 80, "promo code");
      if (typeof body?.active !== "boolean") return result(400, { error: "Choose whether this promo code is active." });
      const updated = await env.ORDERS_DB.prepare(
        "UPDATE promo_codes SET active = ? WHERE promo_id = ?",
      ).bind(body.active ? 1 : 0, promoId).run();
      if (updated.meta?.changes === 0) return result(404, { error: "That promo code could not be found." });
      return result(200, { promoId, active: body.active });
    } catch (error) {
      console.error("Could not update an admin promo code.", error);
      return result(503, { error: "The promo code could not be updated right now. Please try again." });
  }
}

export async function createAdminCustomField(request, env) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    let definition;
    try {
      definition = validateFieldDefinition(body, getPromoCategories());
      assertFieldCapacity(await listCustomFields(env.ORDERS_DB));
    } catch (error) {
      return result(400, { error: error.message });
    }
    const fieldId = `field_${crypto.randomUUID().slice(0, 12)}`;
    await insertOrReplaceField(env.ORDERS_DB, fieldId, definition, true, new Date().toISOString());
    const [field] = (await listCustomFields(env.ORDERS_DB)).filter((entry) => entry.id === fieldId);
    return result(201, { field });
  } catch (error) {
    console.error("Could not create a custom field.", error);
    return result(503, { error: "The custom field could not be created right now. Please try again." });
  }
}

async function insertOrReplaceField(database, fieldId, definition, active, createdAt) {
  await database.prepare(
    `INSERT INTO custom_fields (
      field_id, scope, label, type, config_json, required, placeholder, help_text,
      applies_to_json, sort_order, active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(field_id) DO UPDATE SET
      scope = excluded.scope, label = excluded.label, type = excluded.type,
      config_json = excluded.config_json, required = excluded.required,
      placeholder = excluded.placeholder, help_text = excluded.help_text,
      applies_to_json = excluded.applies_to_json, sort_order = excluded.sort_order,
      active = excluded.active`,
  ).bind(
    fieldId,
    definition.scope,
    definition.label,
    definition.type,
    JSON.stringify(definition.config),
    definition.required ? 1 : 0,
    definition.placeholder,
    definition.helpText,
    JSON.stringify(definition.appliesTo),
    definition.sortOrder,
    active ? 1 : 0,
    createdAt,
  ).run();
}

export async function updateAdminCustomField(request, env) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const fieldId = requiredText(body?.fieldId, 80, "custom field");
    if (typeof body?.active !== "boolean") return result(400, { error: "Choose whether this field is active." });
    const existing = (await listCustomFields(env.ORDERS_DB)).find((entry) => entry.id === fieldId);
    if (!existing) return result(404, { error: "That custom field could not be found." });
    let definition = null;
    if (body.definition !== undefined) {
      try {
        definition = validateFieldDefinition(body.definition, getPromoCategories());
      } catch (error) {
        return result(400, { error: error.message });
      }
    }
    if (definition) {
      await insertOrReplaceField(env.ORDERS_DB, fieldId, definition, body.active, existing.createdAt);
    } else {
      await env.ORDERS_DB.prepare("UPDATE custom_fields SET active = ? WHERE field_id = ?")
        .bind(body.active ? 1 : 0, fieldId).run();
    }
    const [field] = (await listCustomFields(env.ORDERS_DB)).filter((entry) => entry.id === fieldId);
    return result(200, { field });
  } catch (error) {
    console.error("Could not update a custom field.", error);
    return result(503, { error: "The custom field could not be updated right now. Please try again." });
  }
}

export async function deleteAdminCustomField(request, env) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const fieldId = requiredText(body?.fieldId, 80, "custom field");
    const deleted = await env.ORDERS_DB.prepare("DELETE FROM custom_fields WHERE field_id = ?").bind(fieldId).run();
    if (deleted.meta?.changes === 0) return result(404, { error: "That custom field could not be found." });
    return result(200, { fieldId });
  } catch (error) {
    console.error("Could not delete a custom field.", error);
    return result(503, { error: "The custom field could not be deleted right now. Please try again." });
  }
}

export async function createAdminCustomer(request, env) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const name = requiredText(body?.name, 80, "customer name");
    const phone = requiredText(body?.phone, 20, "phone number");
    const email = body?.email === "" || body?.email === undefined
      ? ""
      : normalizeCustomerEmail(body.email);
    const address = requiredText(body?.address, 250, "customer address");
    const city = requiredText(body?.city, 40, "city");
    const state = requiredText(body?.state, 40, "state");
    const pincode = requiredText(body?.pincode, 6, "six-digit Indian PIN code");
    if (!/^[1-9][0-9]{5}$/.test(pincode)) return result(400, { error: "Enter a valid six-digit Indian PIN code." });
    if (!phonePattern.test(phone)) return result(400, { error: "Enter a valid customer phone number." });
    if (body?.email && !email) {
      return result(400, { error: "Enter a valid customer email address." });
    }

    const customerId = `cus_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const savedCustomer = await env.ORDERS_DB
      .prepare(
        `INSERT INTO customers (
          customer_id, customer_name, customer_phone, customer_email,
          default_address, city, state, pincode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(customer_email COLLATE NOCASE) WHERE customer_email <> ''
        DO UPDATE SET
          customer_name = excluded.customer_name,
          customer_phone = excluded.customer_phone,
          customer_email = lower(trim(excluded.customer_email)),
          default_address = excluded.default_address,
          city = excluded.city,
          state = excluded.state,
          pincode = excluded.pincode,
          updated_at = excluded.updated_at
        RETURNING customer_id`,
      )
      .bind(customerId, name, phone, email, address, city, state, pincode, now, now)
      .first();
    if (!savedCustomer?.customer_id) throw new Error("Could not save the customer.");
    return result(201, {
      customer: { customerId: savedCustomer.customer_id, name, phone, email, address, city, state, pincode, updatedAt: now },
    });
  } catch (error) {
    console.error("Could not create an admin customer.", error);
    return result(400, { error: error instanceof Error ? error.message : "Could not create the customer." });
  }
}

export async function updateAdminCustomer(request, env) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    let customerId;
    let name;
    let phone;
    let address;
    let city;
    let state;
    let pincode;
    try {
      customerId = requiredText(body?.customerId, 80, "customer");
      name = requiredText(body?.name, 80, "customer name");
      phone = requiredText(body?.phone, 20, "phone number");
      address = requiredText(body?.address, 250, "customer address");
      city = requiredText(body?.city, 40, "city");
      state = requiredText(body?.state, 40, "state");
      pincode = requiredText(body?.pincode, 6, "six-digit Indian PIN code");
    } catch (error) {
      return result(400, { error: error.message });
    }
    if (!phonePattern.test(phone)) return result(400, { error: "Enter a valid customer phone number." });
    if (!/^[1-9][0-9]{5}$/.test(pincode)) return result(400, { error: "Enter a valid six-digit Indian PIN code." });

    const now = new Date().toISOString();
    const updated = await env.ORDERS_DB
      .prepare(
        `UPDATE customers
         SET customer_name = ?, customer_phone = ?, default_address = ?,
             city = ?, state = ?, pincode = ?, updated_at = ?
         WHERE customer_id = ?`,
      )
      .bind(name, phone, address, city, state, pincode, now, customerId)
      .run();
    if (updated.meta.changes === 0) return result(404, { error: "That customer could not be found." });
    return result(200, { customer: { customerId, name, phone, address, city, state, pincode, updatedAt: now } });
  } catch (error) {
    console.error("Could not update an admin customer.", error);
    return result(503, { error: "The customer details could not be updated right now. Please try again." });
  }
}

// Custom products are admin-only names; one row per name (case-insensitive).
async function saveCustomProduct(database, name) {
  const key = name.toLocaleLowerCase();
  await database
    .prepare("INSERT OR IGNORE INTO custom_products (product_id, name, name_key, created_at) VALUES (?, ?, ?, ?)")
    .bind(`custom_${crypto.randomUUID().slice(0, 12)}`, name, key, new Date().toISOString())
    .run();
  const row = await database.prepare("SELECT product_id FROM custom_products WHERE name_key = ?").bind(key).first();
  if (!row) throw new Error("The custom product could not be saved.");
  return row.product_id;
}

async function listCustomProducts(database) {
  try {
    const { results } = await database
      .prepare("SELECT product_id, name FROM custom_products ORDER BY name COLLATE NOCASE")
      .all();
    return (results ?? []).map((row) => ({ id: row.product_id, name: row.name }));
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) return [];
    throw error;
  }
}

export async function createManualOrder(request, env) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const customerId = requiredText(body?.customerId, 80, "customer");
    const customer = await env.ORDERS_DB
      .prepare(
        `SELECT customer_id, customer_name, customer_phone, customer_email, default_address, city, state, pincode
         FROM customers WHERE customer_id = ?`,
      )
      .bind(customerId)
      .first();
    if (!customer) return result(404, { error: "Choose a saved customer." });
    if (!customer.customer_name || !customer.customer_phone) {
      return result(400, {
        error: "This customer has only signed in so far. Add their name and phone in the customer form before creating a manual order.",
      });
    }

    const deliveryAddress = requiredText(body?.address || customer.default_address, 250, "delivery address");
    const city = requiredText(body?.city || customer.city, 40, "city");
    const state = requiredText(body?.state || customer.state, 40, "state");
    const pincode = requiredText(body?.pincode || customer.pincode, 6, "six-digit Indian PIN code");
    if (!/^[1-9][0-9]{5}$/.test(pincode)) return result(400, { error: "Enter a valid six-digit Indian PIN code." });
    const deliveryMethod = body?.deliveryMethod;
    if (!DELIVERY_METHODS.includes(deliveryMethod)) {
      return result(400, { error: "Choose a valid delivery method." });
    }
    const eventDate = body?.eventDate ?? "";
    if (
      typeof eventDate !== "string" ||
      (eventDate !== "" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
          Number.isNaN(Date.parse(`${eventDate}T00:00:00.000Z`)) ||
          new Date(`${eventDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== eventDate))
    ) {
      return result(400, { error: "Enter a valid event date." });
    }
    if (!Array.isArray(body?.items) || body.items.length === 0 || body.items.length > 8) {
      return result(400, { error: "Add between 1 and 8 order items." });
    }

    const items = [];
    for (const item of body.items) {
      if (item && typeof item === "object" && item.custom === true) {
        const name = requiredText(item.name, 80, "custom product name");
        const price = Math.round(Number(item.unitPriceRupees) * 100) / 100;
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
          throw new Error("Each order item needs a valid product and quantity from 1 to 20.");
        }
        if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
          throw new Error(`Enter a valid price for ${name}.`);
        }
        const wrapper = typeof item.wrapper === "string" ? item.wrapper.trim() : "";
        if (wrapper.length > 120) throw new Error("Wrapper details must be 120 characters or fewer.");
        items.push({
          id: await saveCustomProduct(env.ORDERS_DB, name),
          name,
          quantity: item.quantity,
          unitPriceRupees: price,
          flavour: "",
          wrapper,
        });
        continue;
      }
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 20
      ) {
        throw new Error("Each order item needs a valid product and quantity from 1 to 20.");
      }
      const product = productById.get(item.id);
      if (!product) throw new Error("An order item is not in the product catalog.");
      const flavour = typeof item.flavour === "string" ? item.flavour : "";
      if (
        (product.flavours.length > 0 && !product.flavours.includes(flavour)) ||
        (product.flavours.length === 0 && flavour !== "")
      ) {
        throw new Error(`Choose a flavour available for ${product.name}.`);
      }
      const wrapper = typeof item.wrapper === "string" ? item.wrapper.trim() : "";
      if (wrapper.length > 120) throw new Error("Wrapper details must be 120 characters or fewer.");
      items.push({
        id: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPriceRupees: product.price,
        flavour,
        wrapper,
      });
    }
    const amountPaise = items.reduce((sum, item) => sum + Math.round(item.unitPriceRupees * 100) * item.quantity, 0);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      return result(400, { error: "The order total is invalid." });
    }

    const orderId = generateOrderId();
    const createdAt = new Date().toISOString();
    await env.ORDERS_DB
      .prepare(
        `INSERT INTO orders (
          order_id, payment_id, payment_status, payment_method, order_status,
          customer_id, customer_name, customer_phone, customer_email,
          delivery_address, city, state, pincode, items_json, amount_paise, product_subtotal_paise,
          discount_paise, promo_code, currency,
          delivery_method, distance_km, policies_accepted, event_date, created_at
        ) VALUES (?, NULL, 'unpaid', 'manual', 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', 'INR', ?, 0, 'admin_manual_order', ?, ?)`,
      )
      .bind(
        orderId,
        customer.customer_id,
        customer.customer_name,
        customer.customer_phone,
        customer.customer_email,
        deliveryAddress,
        city,
        state,
        pincode,
        JSON.stringify(items),
        amountPaise,
        amountPaise,
        deliveryMethod,
        eventDate,
        createdAt,
      )
      .run();
    return result(201, { orderId, orderStatus: "received", paymentStatus: "unpaid" });
  } catch (error) {
    console.error("Could not create a manual admin order.", error);
    return result(400, { error: error instanceof Error ? error.message : "Could not create the order." });
  }
}

export async function updateAdminOrderStatus(request, env) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const orderId = requiredText(body?.orderId, 100, "order number");
    if (!ORDER_STATUSES.includes(body?.orderStatus)) {
      return result(400, { error: "Choose a valid order status." });
    }
    const updated = await env.ORDERS_DB
      .prepare("UPDATE orders SET order_status = ? WHERE order_id = ?")
      .bind(body.orderStatus, orderId)
      .run();
    if (updated.meta?.changes === 0) return result(404, { error: "Order not found." });
    return result(200, { orderId, orderStatus: body.orderStatus });
  } catch (error) {
    console.error("Could not update an admin order status.", error);
    return result(503, { error: "The order status could not be updated." });
  }
}
