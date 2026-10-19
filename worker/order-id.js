const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ORDER_ID_PATTERN = /^CC-\d{6}-[A-Z0-9]{5}$/;

// Shop-facing order number, e.g. CC-261020-7K3FQ. Razorpay's own order id is stored separately.
export function generateOrderId(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replaceAll("-", "");
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const suffix = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return `CC-${date}-${suffix}`;
}
