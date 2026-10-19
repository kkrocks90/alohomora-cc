import products from "../src/data/products.json" with { type: "json" };
import { authenticatedEmail, normalizeCustomerEmail } from "./customer-auth.js";

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
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    const [ordersResult, customersResult] = await Promise.all([
      env.ORDERS_DB
        .prepare(
          `SELECT order_id, payment_id, payment_status, payment_method, order_status,
                  customer_id, customer_name, customer_phone, customer_email,
                  delivery_address, items_json, amount_paise, currency,
                  delivery_method, event_date, created_at
           FROM orders
           ORDER BY created_at DESC
           LIMIT 500`,
        )
        .all(),
      env.ORDERS_DB
        .prepare(
          `SELECT customer_id, customer_name, customer_phone, customer_email,
                  default_address, created_at, updated_at
           FROM customers
           ORDER BY customer_name COLLATE NOCASE
           LIMIT 500`,
        )
        .all(),
    ]);
    return result(200, {
      email: access.email,
      orders: ordersResult.results.map((order) => ({
        orderId: order.order_id,
        paymentId: order.payment_id,
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
        orderStatus: order.order_status,
        customerId: order.customer_id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        customerEmail: order.customer_email,
        deliveryAddress: order.delivery_address,
        items: JSON.parse(order.items_json),
        amountPaise: order.amount_paise,
        currency: order.currency,
        deliveryMethod: order.delivery_method,
        eventDate: order.event_date ?? "",
        createdAt: order.created_at,
      })),
      customers: customersResult.results.map((customer) => ({
        customerId: customer.customer_id,
        name: customer.customer_name,
        phone: customer.customer_phone,
        email: customer.customer_email,
        address: customer.default_address,
        createdAt: customer.created_at,
        updatedAt: customer.updated_at,
      })),
      orderStatuses: ORDER_STATUSES,
      products: products.map(({ id, name, price, flavours }) => ({ id, name, price, flavours })),
    });
  } catch (error) {
    console.error("Could not load the admin dashboard.", error);
    return result(503, { error: "The admin dashboard is temporarily unavailable." });
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
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const address = requiredText(body?.address, 250, "customer address");
    if (!phonePattern.test(phone)) return result(400, { error: "Enter a valid customer phone number." });
    if (email.length > 120 || (email !== "" && !emailPattern.test(email))) {
      return result(400, { error: "Enter a valid customer email address." });
    }

    const customerId = `cus_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await env.ORDERS_DB
      .prepare(
        `INSERT INTO customers (
          customer_id, customer_name, customer_phone, customer_email,
          default_address, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(customerId, name, phone, email, address, now, now)
      .run();
    return result(201, {
      customer: { customerId, name, phone, email, address, createdAt: now, updatedAt: now },
    });
  } catch (error) {
    console.error("Could not create an admin customer.", error);
    return result(400, { error: error instanceof Error ? error.message : "Could not create the customer." });
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
        `SELECT customer_id, customer_name, customer_phone, customer_email, default_address
         FROM customers WHERE customer_id = ?`,
      )
      .bind(customerId)
      .first();
    if (!customer) return result(404, { error: "Choose a saved customer." });

    const deliveryAddress = requiredText(body?.address || customer.default_address, 250, "delivery address");
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

    const items = body.items.map((item) => {
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
      return {
        id: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPriceRupees: product.price,
        flavour,
        wrapper,
      };
    });
    const amountPaise = items.reduce((sum, item) => sum + item.unitPriceRupees * item.quantity * 100, 0);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      return result(400, { error: "The order total is invalid." });
    }

    const orderId = `CC-M-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    await env.ORDERS_DB
      .prepare(
        `INSERT INTO orders (
          order_id, payment_id, payment_status, payment_method, order_status,
          customer_id, customer_name, customer_phone, customer_email,
          delivery_address, items_json, amount_paise, currency,
          delivery_method, distance_km, policies_accepted, event_date, created_at
        ) VALUES (?, NULL, 'unpaid', 'manual', 'received', ?, ?, ?, ?, ?, ?, ?, 'INR', ?, 0, 'admin_manual_order', ?, ?)`,
      )
      .bind(
        orderId,
        customer.customer_id,
        customer.customer_name,
        customer.customer_phone,
        customer.customer_email,
        deliveryAddress,
        JSON.stringify(items),
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
