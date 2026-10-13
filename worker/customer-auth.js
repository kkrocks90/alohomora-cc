const encoder = new TextEncoder();
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const CODE_RESEND_DELAY_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const GENERIC_CODE_MESSAGE =
  "If a paid order is associated with that email, a sign-in code will arrive shortly.";

function result(status, body) {
  return { status, body };
}

async function readJson(request) {
  const body = await request.text();
  if (encoder.encode(body).byteLength > 2_000) throw new Error("Request is too large.");
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request must contain valid JSON.");
  }
}

export function normalizeCustomerEmail(email) {
  if (
    typeof email !== "string" ||
    email.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return null;
  }
  return email.trim().toLowerCase();
}

function isConfigured(env, needsEmail = false) {
  if (!env.ORDERS_DB || typeof env.AUTH_TOKEN_SECRET !== "string" ||
      env.AUTH_TOKEN_SECRET.length < 32) {
    return false;
  }
  return !needsEmail ||
    (typeof env.RESEND_API_KEY === "string" && env.RESEND_API_KEY.length > 0 &&
     typeof env.LOGIN_FROM_EMAIL === "string" && env.LOGIN_FROM_EMAIL.includes("@"));
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(byteCount) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendCode(email, code, env) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.LOGIN_FROM_EMAIL,
      to: [email],
      subject: "Your Chocolate Circle sign-in code",
      text: `Your Chocolate Circle sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: `<p>Your Chocolate Circle sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    console.error("The sign-in email provider returned status", response.status);
    throw new Error("Could not send the sign-in code.");
  }
}

export async function requestLoginCode(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  const email = normalizeCustomerEmail(body?.email);
  if (!email) return result(400, { error: "Please enter a valid email address." });
  if (!isConfigured(env, true)) {
    return result(503, { error: "Customer sign-in is not configured yet. Please contact the shop." });
  }

  const now = Date.now();
  try {
    const order = await env.ORDERS_DB
      .prepare("SELECT 1 AS found FROM orders WHERE customer_email = ? COLLATE NOCASE LIMIT 1")
      .bind(email)
      .first();
    if (!order) return result(202, { message: GENERIC_CODE_MESSAGE });

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const codeHash = await hmacHex(env.AUTH_TOKEN_SECRET, `${email}:${code}`);
    const reservation = await env.ORDERS_DB
      .prepare(
        `INSERT INTO customer_login_codes (email, code_hash, expires_at, resend_after, attempts)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(email) DO UPDATE SET
           code_hash = excluded.code_hash,
           expires_at = excluded.expires_at,
           resend_after = excluded.resend_after,
           attempts = 0
         WHERE customer_login_codes.resend_after <= ?`,
      )
      .bind(
        email,
        codeHash,
        now + CODE_LIFETIME_MS,
        now + CODE_RESEND_DELAY_MS,
        now,
      )
      .run();
    if (reservation.meta?.changes === 0) {
      return result(202, { message: GENERIC_CODE_MESSAGE });
    }

    try {
      await sendCode(email, code, env);
    } catch (error) {
      console.error("Could not send a customer sign-in code.", error);
      return result(502, { error: "Could not send a sign-in code right now. Please try again shortly." });
    }
    return result(202, { message: GENERIC_CODE_MESSAGE });
  } catch (error) {
    console.error("Could not prepare customer sign-in.", error);
    return result(503, { error: "Customer sign-in is temporarily unavailable. Please try again shortly." });
  }
}

function bytesFromHex(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function verifyCodeHash(secret, email, code, codeHash) {
  const signature = bytesFromHex(codeHash);
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(`${email}:${code}`));
}

export async function verifyLoginCode(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  const email = normalizeCustomerEmail(body?.email);
  if (!email || typeof body?.code !== "string" || !/^\d{6}$/.test(body.code)) {
    return result(400, { error: "Enter the email address and six-digit code." });
  }
  if (!isConfigured(env)) {
    return result(503, { error: "Customer sign-in is not configured yet. Please contact the shop." });
  }

  const now = Date.now();
  try {
    const attempt = await env.ORDERS_DB
      .prepare(
        `UPDATE customer_login_codes SET attempts = attempts + 1
         WHERE email = ? AND expires_at > ? AND attempts < ?`,
      )
      .bind(email, now, MAX_CODE_ATTEMPTS)
      .run();
    if (attempt.meta?.changes === 0) {
      return result(401, { error: "That sign-in code is invalid or expired. Request a new code and try again." });
    }
    const challenge = await env.ORDERS_DB
      .prepare("SELECT code_hash, expires_at, attempts FROM customer_login_codes WHERE email = ?")
      .bind(email)
      .first();
    const valid = challenge &&
      challenge.expires_at > now &&
      challenge.attempts <= MAX_CODE_ATTEMPTS &&
      await verifyCodeHash(env.AUTH_TOKEN_SECRET, email, body.code, challenge.code_hash);
    if (!valid) return result(401, { error: "That sign-in code is invalid or expired. Request a new code and try again." });

    const consumed = await env.ORDERS_DB
      .prepare(
        `DELETE FROM customer_login_codes
         WHERE email = ? AND code_hash = ? AND expires_at > ? AND attempts <= ?`,
      )
      .bind(email, challenge.code_hash, now, MAX_CODE_ATTEMPTS)
      .run();
    if (consumed.meta?.changes === 0) {
      return result(401, { error: "That sign-in code is invalid or expired. Request a new code and try again." });
    }

    const token = randomHex(32);
    const expiresAt = now + SESSION_LIFETIME_MS;
    await env.ORDERS_DB
      .prepare("INSERT INTO customer_sessions (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256Hex(token), email, expiresAt, now)
      .run();
    return result(200, { token, expiresAt });
  } catch (error) {
    console.error("Could not verify a customer sign-in code.", error);
    return result(503, { error: "Customer sign-in is temporarily unavailable. Please try again shortly." });
  }
}

async function authenticatedEmail(request, env) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([0-9a-f]{64})$/i.exec(authorization);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1].toLowerCase());
  const session = await env.ORDERS_DB
    .prepare("SELECT email FROM customer_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(tokenHash, Date.now())
    .first();
  return session?.email ?? null;
}

export async function getCustomerOrders(request, env) {
  if (!isConfigured(env)) {
    return result(503, { error: "Customer sign-in is not configured yet. Please contact the shop." });
  }
  try {
    const email = await authenticatedEmail(request, env);
    if (!email) return result(401, { error: "Please sign in to view your orders." });
    const { results } = await env.ORDERS_DB
      .prepare(
        `SELECT order_id, payment_status, items_json, amount_paise, currency,
                delivery_method, created_at
         FROM orders
         WHERE customer_email = ? COLLATE NOCASE
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .bind(email)
      .all();
    return result(200, {
      email,
      orders: results.map((order) => ({
        orderId: order.order_id,
        status: order.payment_status,
        items: JSON.parse(order.items_json),
        amountPaise: order.amount_paise,
        currency: order.currency,
        deliveryMethod: order.delivery_method,
        createdAt: order.created_at,
      })),
    });
  } catch (error) {
    console.error("Could not load customer order history.", error);
    return result(503, { error: "Your order history is temporarily unavailable. Please try again shortly." });
  }
}

export async function logoutCustomer(request, env) {
  if (!isConfigured(env)) {
    return result(503, { error: "Customer sign-in is not configured yet. Please contact the shop." });
  }
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([0-9a-f]{64})$/i.exec(authorization);
  if (!match) return result(200, { loggedOut: true });
  try {
    await env.ORDERS_DB
      .prepare("DELETE FROM customer_sessions WHERE token_hash = ?")
      .bind(await sha256Hex(match[1].toLowerCase()))
      .run();
    return result(200, { loggedOut: true });
  } catch (error) {
    console.error("Could not end a customer session.", error);
    return result(503, { error: "Could not sign out right now. Please try again." });
  }
}
