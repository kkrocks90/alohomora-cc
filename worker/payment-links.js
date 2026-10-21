import { authenticatedEmail, normalizeCustomerEmail } from "./customer-auth.js";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const encoder = new TextEncoder();

function result(status, body) {
  return { status, body };
}

function basicAuth(env) {
  return `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`;
}

async function requireAdmin(request, env) {
  const adminEmail = normalizeCustomerEmail(env.ADMIN_EMAIL);
  if (!env.ORDERS_DB || !adminEmail || typeof env.AUTH_TOKEN_SECRET !== "string") {
    return result(503, { error: "Admin access is not configured." });
  }
  const email = await authenticatedEmail(request, env);
  if (!email) return result(401, { error: "Please sign in to continue." });
  if (email !== adminEmail) return result(403, { error: "This account does not have admin access." });
  return null;
}

async function readOrderId(request) {
  try {
    const body = await request.json();
    return typeof body?.orderId === "string" ? body.orderId.trim().slice(0, 100) : "";
  } catch {
    return "";
  }
}

export async function createAdminPaymentLink(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return result(503, { error: "Razorpay is not configured." });
  }
  const orderId = await readOrderId(request);
  if (!orderId) return result(400, { error: "Choose an order." });
  try {
    const order = await env.ORDERS_DB
      .prepare(
        `SELECT order_id, payment_status, payment_method, amount_paise, customer_name,
                customer_phone, customer_email, payment_link_id, payment_link_url
         FROM orders WHERE order_id = ?`,
      )
      .bind(orderId)
      .first();
    if (!order) return result(404, { error: "Order not found." });
    if (order.payment_status === "paid" || order.payment_method === "promo") {
      return result(409, { error: "This order does not need a payment." });
    }
    if (order.payment_link_url) {
      return result(200, { orderId, paymentLinkUrl: order.payment_link_url, reused: true });
    }
    const customer = { name: order.customer_name || undefined };
    if (/^\+?[0-9]{10,15}$/.test(order.customer_phone ?? "")) customer.contact = order.customer_phone;
    if (order.customer_email) customer.email = order.customer_email;
    let response;
    try {
      response = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: { Authorization: basicAuth(env), ...JSON_HEADERS },
        body: JSON.stringify({
          amount: order.amount_paise,
          currency: "INR",
          reference_id: order.order_id,
          description: `Chocolate Circle order ${order.order_id}`,
          customer,
          notify: { sms: false, email: false },
          notes: { order_id: order.order_id },
        }),
      });
    } catch (error) {
      console.error("Could not reach Razorpay to create a payment link.", error);
      return result(503, { error: "Razorpay could not be reached. Please try again." });
    }
    if (!response.ok) {
      console.error("Razorpay payment link creation failed with status", response.status);
      return result(502, { error: "Razorpay could not create the payment link." });
    }
    const link = await response.json();
    if (typeof link?.id !== "string" || typeof link?.short_url !== "string") {
      return result(502, { error: "Razorpay returned an unexpected response." });
    }
    await env.ORDERS_DB
      .prepare("UPDATE orders SET payment_link_id = ?, payment_link_url = ? WHERE order_id = ?")
      .bind(link.id, link.short_url, orderId)
      .run();
    return result(200, { orderId, paymentLinkUrl: link.short_url, reused: false });
  } catch (error) {
    console.error("Could not create an admin payment link.", error);
    return result(503, { error: "The payment link could not be created." });
  }
}

export async function markAdminOrderPaid(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const orderId = await readOrderId(request);
  if (!orderId) return result(400, { error: "Choose an order." });
  try {
    const updated = await env.ORDERS_DB
      .prepare("UPDATE orders SET payment_status = 'paid' WHERE order_id = ? AND payment_status <> 'paid'")
      .bind(orderId)
      .run();
    if (updated.meta?.changes === 0) return result(404, { error: "Order not found or already paid." });
    return result(200, { orderId, paymentStatus: "paid" });
  } catch (error) {
    console.error("Could not mark an order paid.", error);
    return result(503, { error: "The order could not be updated." });
  }
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g).map((byte) => parseInt(byte, 16)));
}

async function validSignature(rawBody, signature, secret) {
  const bytes = hexToBytes(signature);
  if (!bytes) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(rawBody));
}

export async function handleRazorpayWebhook(request, env) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !env.ORDERS_DB) {
    return result(503, { error: "Webhook is not configured." });
  }
  const rawBody = await request.text();
  let valid = false;
  try {
    valid = await validSignature(rawBody, request.headers.get("X-Razorpay-Signature"), env.RAZORPAY_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Could not verify the Razorpay webhook signature.", error);
  }
  if (!valid) return result(400, { error: "Invalid signature." });

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return result(400, { error: "Invalid payload." });
  }
  if (event?.event !== "payment_link.paid") return result(200, { ignored: true });

  const link = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  if (!link?.id || !payment?.id || link.status !== "paid") return result(200, { ignored: true });
  try {
    const order = await env.ORDERS_DB
      .prepare("SELECT order_id, amount_paise, payment_status FROM orders WHERE payment_link_id = ?")
      .bind(link.id)
      .first();
    if (!order) return result(200, { ignored: true });
    if (order.payment_status === "paid") return result(200, { alreadyPaid: true });
    if (link.amount_paid !== order.amount_paise && payment.amount !== order.amount_paise) {
      console.error("Payment link amount did not match order", order.order_id);
      return result(200, { ignored: true });
    }
    await env.ORDERS_DB
      .prepare(
        "UPDATE orders SET payment_status = 'paid', payment_id = ?, payment_method = 'razorpay' WHERE order_id = ? AND payment_status <> 'paid'",
      )
      .bind(payment.id, order.order_id)
      .run();
    return result(200, { orderId: order.order_id, paymentStatus: "paid" });
  } catch (error) {
    console.error("Could not record a payment link payment.", error);
    return result(500, { error: "Could not record the payment." });
  }
}
