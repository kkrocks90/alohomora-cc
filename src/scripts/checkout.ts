import {
  CART_STORAGE_KEY,
  CUSTOMER_SESSION_KEY,
  loadCart,
  productById,
  saveCart,
  type CartItem,
} from "./cart";

interface PaymentOrder {
  id: string;
  amount: number;
  currency: "INR";
  keyId: string;
  fulfillmentMethod: "Porter (manual booking)" | "Courier (manual booking)";
  distanceKm: number;
}

interface PaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  handler: (response: PaymentResponse) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, callback: (details: { error?: { description?: string } }) => void) => void;
    };
  }
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The checkout page is missing ${selector}.`);
  return element;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const root = requireElement<HTMLElement>("#checkout-page");
const apiUrl = (root.dataset.checkoutApi ?? "").replace(/\/+$/, "");
const baseUrl = root.dataset.baseUrl ?? "/";
const loginPanel = requireElement<HTMLElement>("#checkout-login");
const checkoutContent = requireElement<HTMLElement>("#checkout-content");
const emptyPanel = requireElement<HTMLElement>("#checkout-empty");
const emailForm = requireElement<HTMLFormElement>("#checkout-email-form");
const codeForm = requireElement<HTMLFormElement>("#checkout-code-form");
const emailInput = requireElement<HTMLInputElement>("#checkout-email");
const codeInput = requireElement<HTMLInputElement>("#checkout-code");
const loginStatus = requireElement<HTMLElement>("#checkout-login-status");
const checkoutForm = requireElement<HTMLFormElement>("#checkout-form");
const eventDateInput = requireElement<HTMLInputElement>("#checkout-form input[name=eventDate]");
const checkoutStatus = requireElement<HTMLElement>("#checkout-status");
const checkoutButton = requireElement<HTMLButtonElement>("#checkout-button");
const locationButton = requireElement<HTMLButtonElement>("#use-delivery-location");
const signedInEmail = requireElement<HTMLElement>("#checkout-signed-in");
const signOutButton = requireElement<HTMLButtonElement>("#checkout-sign-out");
const orderItems = requireElement<HTMLElement>("#checkout-order-items");
const orderTotal = requireElement<HTMLElement>("#checkout-total");
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

let cart: CartItem[] = loadCart();
let customerEmail = "";
let sessionToken = "";

const today = new Date();
eventDateInput.min = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

function setLoginStatus(message: string, error = false) {
  loginStatus.textContent = message;
  loginStatus.dataset.state = error ? "error" : "success";
}

function setCheckoutStatus(message: string, error = false) {
  checkoutStatus.textContent = message;
  checkoutStatus.dataset.state = error ? "error" : "success";
}

function getToken() {
  const token = sessionStorage.getItem(CUSTOMER_SESSION_KEY) ?? "";
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}

async function requestApi(path: string, body?: unknown, token = sessionToken) {
  if (!apiUrl) throw new Error("Online checkout isn’t configured. Please contact the shop.");
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The checkout service returned an unreadable response.");
  }
  if (!isRecord(payload)) throw new Error("The checkout service returned an invalid response.");
  if (!response.ok) {
    if (response.status === 401 && token) {
      sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
      window.dispatchEvent(new Event("customer-session-change"));
      sessionToken = "";
      customerEmail = "";
      showLogin();
      setLoginStatus("Your sign-in expired. Please sign in again to continue.", true);
    }
    throw new Error(typeof payload.error === "string" ? payload.error : "The checkout request failed.");
  }
  return payload;
}

function showLogin() {
  loginPanel.hidden = false;
  checkoutContent.hidden = true;
  emailForm.hidden = false;
  codeForm.hidden = true;
}

function renderOrder() {
  cart = loadCart();
  orderItems.replaceChildren();
  const total = cart.reduce((sum, item) => sum + productById.get(item.id)!.price * item.quantity, 0);
  orderTotal.textContent = currency.format(total);
  emptyPanel.hidden = cart.length > 0;
  loginPanel.hidden = cart.length === 0 || Boolean(customerEmail);
  checkoutContent.hidden = cart.length === 0 || !customerEmail;

  for (const item of cart) {
    const product = productById.get(item.id)!;
    const row = document.createElement("div");
    row.className = "checkout-order-line";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = product.name;
    const options = document.createElement("span");
    options.textContent = [
      item.quantity > 1 ? `Quantity: ${item.quantity}` : "",
      item.flavour ? `Flavour: ${item.flavour}` : "",
      `Wrapper: ${item.wrapper}`,
    ].filter(Boolean).join(" · ");
    details.append(name, options);
    const price = document.createElement("span");
    price.textContent = currency.format(product.price * item.quantity);
    row.append(details, price);
    orderItems.append(row);
  }
}

async function loadSession(token: string) {
  sessionToken = token;
  const result = await requestApi("/auth/orders", undefined, token);
  if (typeof result.email !== "string") throw new Error("Sign-in returned an invalid email address.");
  customerEmail = result.email;
  signedInEmail.textContent = `Signed in as ${customerEmail}`;
  setLoginStatus("");
  renderOrder();
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!emailForm.reportValidity()) return;
  setLoginStatus("Sending your sign-in code…");
  const email = emailInput.value.trim().toLowerCase();
  try {
    const result = await requestApi("/auth/request-code", { email }, "");
    setLoginStatus(typeof result.message === "string" ? result.message : "Check your email for a sign-in code.");
    codeForm.hidden = false;
    emailForm.hidden = true;
    codeInput.focus();
  } catch (error) {
    setLoginStatus(error instanceof Error ? error.message : "Could not send your sign-in code.", true);
  }
});

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!codeForm.reportValidity()) return;
  setLoginStatus("Verifying your code…");
  try {
    const result = await requestApi("/auth/verify-code", {
      email: emailInput.value.trim().toLowerCase(),
      code: codeInput.value.trim(),
    }, "");
    if (typeof result.token !== "string" || !/^[0-9a-f]{64}$/.test(result.token)) {
      throw new Error("Sign-in returned an invalid session. Please try again.");
    }
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, result.token);
    window.dispatchEvent(new Event("customer-session-change"));
    await loadSession(result.token);
  } catch (error) {
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    window.dispatchEvent(new Event("customer-session-change"));
    sessionToken = "";
    customerEmail = "";
    showLogin();
    setLoginStatus(error instanceof Error ? error.message : "Could not verify your code.", true);
  }
});

requireElement<HTMLButtonElement>("#checkout-change-email").addEventListener("click", () => {
  codeForm.hidden = true;
  emailForm.hidden = false;
  codeInput.value = "";
  setLoginStatus("");
  emailInput.focus();
});

signOutButton.addEventListener("click", async () => {
  let signOutMessage = "You’re signed out.";
  let signOutError = false;
  try {
    await requestApi("/auth/logout");
  } catch {
    signOutMessage = "Signed out on this device, but the session could not be revoked. Please try again.";
    signOutError = true;
  }
  sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
  window.dispatchEvent(new Event("customer-session-change"));
  sessionToken = "";
  customerEmail = "";
  showLogin();
  setLoginStatus(signOutMessage, signOutError);
});

locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setCheckoutStatus("Location isn’t available in this browser. Enter the delivery pin coordinates instead.", true);
    return;
  }
  locationButton.disabled = true;
  setCheckoutStatus("Finding this device’s location…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitudeInput = checkoutForm.elements.namedItem("latitude");
      const longitudeInput = checkoutForm.elements.namedItem("longitude");
      if (!(latitudeInput instanceof HTMLInputElement) || !(longitudeInput instanceof HTMLInputElement)) {
        throw new Error("The delivery coordinate fields are missing.");
      }
      latitudeInput.value = position.coords.latitude.toFixed(6);
      longitudeInput.value = position.coords.longitude.toFixed(6);
      locationButton.disabled = false;
      setCheckoutStatus("Location added. Confirm it matches the delivery address pin.");
    },
    (error) => {
      locationButton.disabled = false;
      const message = error.code === error.PERMISSION_DENIED
        ? "Location access was denied. Allow access or enter the delivery pin coordinates."
        : error.code === error.TIMEOUT
          ? "Couldn’t get your location in time. Try again or enter the pin coordinates."
          : "Couldn’t get your location. Check device settings or enter the pin coordinates.";
      setCheckoutStatus(message, true);
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
  );
});

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay
      ? resolve()
      : reject(new Error("Razorpay checkout did not load. Please check your connection and try again."));
    script.onerror = () => reject(new Error("Could not load secure payment checkout. Please try again."));
    document.head.append(script);
  });
}

function isPaymentOrder(value: unknown): value is PaymentOrder {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.amount === "number" &&
    value.currency === "INR" &&
    typeof value.keyId === "string" &&
    (value.fulfillmentMethod === "Porter (manual booking)" ||
      value.fulfillmentMethod === "Courier (manual booking)") &&
    typeof value.distanceKm === "number" &&
    Number.isFinite(value.distanceKm) &&
    value.distanceKm >= 0;
}

async function verifyPayment(payment: PaymentResponse) {
  const result = await requestApi("/verify", payment);
  if (result.verified !== true || typeof result.orderId !== "string") {
    throw new Error("Payment verification returned incomplete order details.");
  }
  cart = [];
  saveCart(cart);
  window.location.assign(`${baseUrl}thank-you/?order=${encodeURIComponent(result.orderId)}`);
}

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setCheckoutStatus("");
  if (!checkoutForm.reportValidity()) return;
  if (!sessionToken || !customerEmail) {
    showLogin();
    setLoginStatus("Sign in with your email to continue.", true);
    return;
  }
  if (cart.length === 0) {
    renderOrder();
    return;
  }

  const formData = new FormData(checkoutForm);
  const deliveryLocation = {
    latitude: Number(formData.get("latitude")),
    longitude: Number(formData.get("longitude")),
  };
  if (
    !Number.isFinite(deliveryLocation.latitude) ||
    deliveryLocation.latitude < -90 ||
    deliveryLocation.latitude > 90 ||
    !Number.isFinite(deliveryLocation.longitude) ||
    deliveryLocation.longitude < -180 ||
    deliveryLocation.longitude > 180
  ) {
    setCheckoutStatus("Enter valid latitude and longitude for the delivery address pin.", true);
    return;
  }
  checkoutButton.disabled = true;
  setCheckoutStatus("Preparing your secure checkout…");
  try {
    const orderResult = await requestApi("/orders", {
      items: cart.map(({ id, quantity, flavour, wrapper }) => ({ id, quantity, flavour, wrapper })),
      customer: {
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        email: customerEmail,
        address: String(formData.get("address") ?? ""),
        eventDate: String(formData.get("eventDate") ?? ""),
        policyConsent: formData.get("policyConsent") === "on",
      },
      deliveryLocation,
    });
    if (!isPaymentOrder(orderResult)) throw new Error("The checkout service returned incomplete payment details.");
    await loadRazorpay();
    if (!window.Razorpay) throw new Error("Razorpay checkout is not available. Please try again.");

    setCheckoutStatus(
      `About ${orderResult.distanceKm.toFixed(2)} km in a straight line · ${orderResult.fulfillmentMethod}. Delivery arrangements are confirmed separately.`,
    );
    const razorpay = new window.Razorpay({
      key: orderResult.keyId,
      amount: orderResult.amount,
      currency: orderResult.currency,
      name: "Chocolate Circle",
      description: "Handmade chocolate order",
      order_id: orderResult.id,
      prefill: {
        name: String(formData.get("name") ?? ""),
        email: customerEmail,
        contact: String(formData.get("phone") ?? ""),
      },
      handler: (payment) => {
        setCheckoutStatus("Payment received. Verifying securely…");
        void verifyPayment(payment).catch((error: unknown) => {
          setCheckoutStatus(
            error instanceof Error ? error.message : "Payment verification failed. Please contact the shop.",
            true,
          );
        });
      },
      modal: { ondismiss: () => setCheckoutStatus("Checkout closed. Your bag is saved whenever you’re ready.") },
      theme: { color: "#624234" },
    });
    razorpay.on("payment.failed", (details) => {
      setCheckoutStatus(details.error?.description || "Payment did not go through. Please try another method.", true);
    });
    razorpay.open();
  } catch (error) {
    setCheckoutStatus(error instanceof Error ? error.message : "Checkout could not be started. Please try again.", true);
  } finally {
    checkoutButton.disabled = false;
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === CART_STORAGE_KEY) renderOrder();
});

renderOrder();
if (cart.length > 0) {
  const token = getToken();
  if (token) {
    void loadSession(token).catch((error: unknown) => {
      sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
      window.dispatchEvent(new Event("customer-session-change"));
      sessionToken = "";
      customerEmail = "";
      showLogin();
      setLoginStatus(error instanceof Error ? error.message : "Please sign in to continue.", true);
    });
  } else {
    showLogin();
  }
}
