const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));

const rupees = (paise) => `Rs. ${(Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function itemLine(item) {
  const extras = [item.flavour, item.wrapper].filter(Boolean).join(", ");
  return `${item.quantity} x ${item.name}${extras ? ` (${extras})` : ""}`;
}

function summarise(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const received = Number(order.amountReceivedPaise ?? (order.paid ? order.amountPaise : 0));
  const due = Math.max(0, Number(order.amountPaise || 0) - received);
  const payment = due === 0 ? "Paid" : received > 0 ? `Partially paid (balance ${rupees(due)})` : "Payment pending";
  const address = [order.deliveryAddress, order.city, order.state, order.pincode].filter(Boolean).join(", ");
  return { items, payment, address };
}

async function send(env, message) {
  if (typeof env.RESEND_API_KEY !== "string" || !env.RESEND_API_KEY ||
      typeof env.LOGIN_FROM_EMAIL !== "string" || !env.LOGIN_FROM_EMAIL.includes("@")) return;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.LOGIN_FROM_EMAIL, ...message }),
    });
    if (!response.ok) console.error("The order email provider returned status", response.status);
  } catch (error) {
    console.error("Could not send an order email.", error);
  }
}

// Never throws: a failed email must not fail the order.
export async function sendOrderEmails(env, order) {
  const { items, payment, address } = summarise(order);
  const lines = items.map(itemLine);
  const listHtml = `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
  const total = rupees(order.amountPaise);

  if (env.ADMIN_EMAIL) {
    const text = [
      `New order ${order.orderId}`,
      `Customer: ${order.customerName} | ${order.customerPhone}${order.customerEmail ? ` | ${order.customerEmail}` : ""}`,
      ...lines,
      `Total: ${total} - ${payment}`,
      order.eventDate ? `Needed by: ${order.eventDate}` : "",
      `Delivery: ${order.deliveryMethod || "-"} to ${address || "-"}`,
    ].filter(Boolean).join("\n");
    await send(env, {
      to: [env.ADMIN_EMAIL],
      subject: `New order ${order.orderId} - ${total}`,
      text,
      html: `<p>${escapeHtml(text.split("\n")[0])}</p><p>${escapeHtml(order.customerName)}, ${escapeHtml(order.customerPhone)} ${escapeHtml(order.customerEmail)}</p>${listHtml}<p><b>Total ${escapeHtml(total)}</b> - ${escapeHtml(payment)}</p><p>${escapeHtml(order.eventDate ? `Needed by: ${order.eventDate}` : "")}</p><p>Delivery: ${escapeHtml(order.deliveryMethod || "-")} to ${escapeHtml(address || "-")}</p>`,
    });
  }

  if (order.customerEmail && order.customerEmail.includes("@")) {
    const text = [
      `Hi ${order.customerName},`,
      `Thank you for your order with Chocolate Circle! Your order number is ${order.orderId}.`,
      ...lines,
      `Total: ${total} - ${payment}`,
      "We will be in touch on WhatsApp or phone if we need anything. Reply to this email or message us on WhatsApp at +91 95008 68468 for any questions.",
    ].join("\n");
    await send(env, {
      to: [order.customerEmail],
      reply_to: env.ADMIN_EMAIL || undefined,
      subject: `Your Chocolate Circle order ${order.orderId}`,
      text,
      html: `<p>Hi ${escapeHtml(order.customerName)},</p><p>Thank you for your order with Chocolate Circle! Your order number is <b>${escapeHtml(order.orderId)}</b>.</p>${listHtml}<p><b>Total ${escapeHtml(total)}</b> - ${escapeHtml(payment)}</p><p>We will be in touch on WhatsApp or phone if we need anything. Reply to this email or message us on WhatsApp at +91 95008 68468 for any questions.</p>`,
    });
  }
}
