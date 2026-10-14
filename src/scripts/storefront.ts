import products from "../data/products.json";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  tag: string;
  packSize: string;
  flavours: string[];
  featured?: boolean;
};
interface CartItem {
  id: string;
  quantity: number;
  flavour: string;
  wrapper: string;
}
type Cart = CartItem[];

interface PaymentOrder {
  id: string;
  amount: number;
  currency: string;
  keyId: string;
  fulfillmentMethod: "Porter (manual booking)" | "Courier (manual booking)";
  distanceKm: number;
}

interface VerifiedPayment {
  verified: true;
  fulfillmentMethod: PaymentOrder["fulfillmentMethod"];
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
  if (!element) throw new Error(`The storefront is missing the required ${selector} element.`);
  return element;
}

const storefront = requireElement<HTMLElement>("#storefront");
const openCartButton = requireElement<HTMLButtonElement>("#open-cart");
const closeCartButton = requireElement<HTMLButtonElement>("#close-cart");
const cartDrawer = requireElement<HTMLElement>("#cart-drawer");
const backdrop = requireElement<HTMLElement>("#drawer-backdrop");
const cartItems = requireElement<HTMLElement>("#cart-items");
const cartSummary = requireElement<HTMLElement>("#cart-summary");
const emptyCart = requireElement<HTMLElement>("#empty-cart");
const cartTotal = requireElement<HTMLElement>("#cart-total");
const bagCount = requireElement<HTMLElement>("#bag-count");
const checkoutForm = requireElement<HTMLFormElement>("#checkout-form");
const checkoutButton = requireElement<HTMLButtonElement>("#checkout-button");
const checkoutStatus = requireElement<HTMLElement>("#checkout-status");
const locationButton = requireElement<HTMLButtonElement>("#use-delivery-location");

const productById = new Map<string, Product>(products.map((product) => [product.id, product]));
const checkoutApiUrl = (storefront.dataset.checkoutApi ?? "").replace(/\/+$/, "");
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const storageKey = "cocoa-kind-cart-v1";
let legacyCartNeedsOptions = false;
let cart: Cart = loadCart();
let previousFocus: HTMLElement | null = null;
let paymentConfirmed = false;

function loadCart(): Cart {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return [];

  const parsed: unknown = JSON.parse(saved);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Your saved shopping bag could not be read. Please clear this site's saved data and try again.");
  }

  if (!Array.isArray(parsed)) {
    localStorage.removeItem(storageKey);
    legacyCartNeedsOptions = true;
    return [];
  }

  return parsed.filter((item): item is CartItem =>
    Boolean(
      item &&
      typeof item === "object" &&
      productById.has(item.id) &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      item.quantity <= 20 &&
      typeof item.flavour === "string" &&
      (productById.get(item.id)!.flavours.length > 0
        ? productById.get(item.id)!.flavours.includes(item.flavour)
        : item.flavour === "") &&
      typeof item.wrapper === "string" &&
      item.wrapper.trim().length >= 3 &&
      item.wrapper.trim().length <= 120,
    ),
  );
}

function saveCart() {
  localStorage.setItem(storageKey, JSON.stringify(cart));
}

function getCartItemKey(item: Pick<CartItem, "id" | "flavour" | "wrapper">) {
  return JSON.stringify([item.id, item.flavour, item.wrapper]);
}

function setStatus(message: string, state: "info" | "error" | "success" = "info") {
  checkoutStatus.textContent = message;
  checkoutStatus.dataset.state = state;
}

function renderCart() {
  cartItems.replaceChildren();
  const entries = cart.filter((item) => productById.has(item.id) && item.quantity > 0);
  const count = entries.reduce((sum, item) => sum + item.quantity, 0);
  const total = entries.reduce((sum, item) => sum + productById.get(item.id)!.price * item.quantity, 0);

  bagCount.textContent = String(count);
  openCartButton.setAttribute("aria-label", `Your shopping bag, ${count} ${count === 1 ? "item" : "items"}`);
  emptyCart.hidden = entries.length > 0;
  if (entries.length === 0) {
    emptyCart.textContent = paymentConfirmed
      ? "Payment confirmed. We’ll follow up using the contact details you entered."
      : "Your bag is waiting for something lovely.";
  }
  cartSummary.hidden = entries.length === 0;
  cartTotal.textContent = currency.format(total);

  for (const item of entries) {
    const product = productById.get(item.id)!;
    const row = document.createElement("div");
    row.className = "cart-line";

    const copy = document.createElement("div");
    copy.className = "cart-line-copy";
    const name = document.createElement("strong");
    name.textContent = product.name;
    const price = document.createElement("span");
    price.textContent = `${currency.format(product.price)} each`;
    const wrapper = document.createElement("span");
    wrapper.textContent = `Wrapper: ${item.wrapper}`;
    copy.append(name);
    if (item.flavour) {
      const flavour = document.createElement("span");
      flavour.textContent = `Flavour: ${item.flavour}`;
      copy.append(flavour);
    }
    copy.append(wrapper, price);

    const controls = document.createElement("div");
    controls.className = "cart-quantity";
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", `Remove one ${product.name}`);
    decrease.dataset.cartAction = "decrease";
    decrease.dataset.productId = item.id;
    decrease.dataset.productFlavour = item.flavour;
    decrease.dataset.productWrapper = item.wrapper;
    const amount = document.createElement("span");
    amount.textContent = String(item.quantity);
    amount.setAttribute("aria-label", `${item.quantity} ${item.quantity === 1 ? "item" : "items"}`);
    const increase = document.createElement("button");
    increase.type = "button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", `Add one ${product.name}`);
    increase.dataset.cartAction = "increase";
    increase.dataset.productId = item.id;
    increase.dataset.productFlavour = item.flavour;
    increase.dataset.productWrapper = item.wrapper;
    controls.append(decrease, amount, increase);
    row.append(copy, controls);
    cartItems.append(row);
  }
}

function openCart() {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
  backdrop.hidden = false;
  openCartButton.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  closeCartButton.focus();
}

function closeCart() {
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  openCartButton.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  previousFocus?.focus();
}

openCartButton.addEventListener("click", openCart);
closeCartButton.addEventListener("click", closeCart);
backdrop.addEventListener("click", closeCart);

locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Location isn’t available in this browser. Enter the delivery pin’s latitude and longitude instead.", "error");
    return;
  }

  locationButton.disabled = true;
  setStatus("Finding this device’s location…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitudeInput = checkoutForm.elements.namedItem("latitude");
      const longitudeInput = checkoutForm.elements.namedItem("longitude");
      if (!(latitudeInput instanceof HTMLInputElement) || !(longitudeInput instanceof HTMLInputElement)) {
        throw new Error("The delivery coordinate fields are missing.");
      }
      latitudeInput.value = position.coords.latitude.toFixed(6);
      longitudeInput.value = position.coords.longitude.toFixed(6);
      setStatus("Location added. Confirm this device is at the delivery address.");
      locationButton.disabled = false;
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "Location access was denied. Allow location access or enter the delivery pin’s coordinates instead."
        : error.code === error.TIMEOUT
          ? "Couldn’t get your location in time. Try again or enter the delivery pin’s coordinates."
          : "Couldn’t get your location. Check your device settings or enter the delivery pin’s coordinates.";
      setStatus(message, "error");
      locationButton.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
  );
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cartDrawer.classList.contains("is-open")) {
    closeCart();
  }
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const addButton = event.target.closest<HTMLButtonElement>("[data-add-to-cart]");
  if (addButton) {
    const id = addButton.dataset.addToCart;
    if (!id || !productById.has(id)) throw new Error(`Unknown product in storefront: ${id ?? "missing id"}`);
    const optionsForm = addButton.closest<HTMLFormElement>("#product-options-form");
    if (!optionsForm || !optionsForm.reportValidity()) return;
    const formData = new FormData(optionsForm);
    const flavour = String(formData.get("flavour") ?? "");
    const wrapper = String(formData.get("wrapper") ?? "").trim();
    const product = productById.get(id)!;
    const hasValidFlavour = product.flavours.length > 0
      ? product.flavours.includes(flavour)
      : flavour === "";
    if (!hasValidFlavour || wrapper.length < 3 || wrapper.length > 120) {
      setStatus("Choose an available flavour and describe your wrapper design in 3 to 120 characters.", "error");
      return;
    }
    paymentConfirmed = false;
    const newItem = { id, quantity: 1, flavour, wrapper };
    const existingItem = cart.find((item) => getCartItemKey(item) === getCartItemKey(newItem));
    if (existingItem) existingItem.quantity = Math.min(existingItem.quantity + 1, 20);
    else cart.push(newItem);
    saveCart();
    renderCart();
    if (legacyCartNeedsOptions) {
      setStatus("Your saved bag needed flavour and wrapper choices, so it was cleared. Please choose both options again.", "info");
    }
    setStatus("");
    openCart();
    return;
  }

  const quantityButton = event.target.closest<HTMLButtonElement>("[data-cart-action]");
  const id = quantityButton?.dataset.productId;
  const flavour = quantityButton?.dataset.productFlavour;
  const wrapper = quantityButton?.dataset.productWrapper;
  if (!quantityButton || !id || typeof flavour !== "string" || !wrapper || !productById.has(id)) return;
  const item = cart.find((entry) => getCartItemKey(entry) === getCartItemKey({ id, flavour, wrapper }));
  if (!item) return;
  item.quantity = quantityButton.dataset.cartAction === "increase"
    ? Math.min(item.quantity + 1, 20)
    : Math.max(item.quantity - 1, 0);
  if (item.quantity === 0) cart = cart.filter((entry) => entry !== item);
  saveCart();
  renderCart();
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

async function readApiResponse<T>(
  response: Response,
  isResponse: (payload: unknown) => payload is T,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The secure checkout service returned an unreadable response.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The secure checkout service returned an invalid response.");
  }
  if (!response.ok) {
    const error = "error" in payload && typeof payload.error === "string" ? payload.error : "";
    throw new Error(error || "Secure checkout could not complete your request.");
  }
  if (!isResponse(payload)) {
    throw new Error("The secure checkout service returned incomplete details.");
  }
  return payload;
}

function isPaymentOrder(payload: unknown): payload is PaymentOrder {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    typeof payload.id === "string" &&
    "amount" in payload &&
    typeof payload.amount === "number" &&
    "currency" in payload &&
    payload.currency === "INR" &&
    "keyId" in payload &&
    typeof payload.keyId === "string" &&
    "fulfillmentMethod" in payload &&
    (payload.fulfillmentMethod === "Porter (manual booking)" ||
      payload.fulfillmentMethod === "Courier (manual booking)") &&
    "distanceKm" in payload &&
    typeof payload.distanceKm === "number" &&
    Number.isFinite(payload.distanceKm) &&
    payload.distanceKm >= 0
  );
}

function isVerifiedPayment(payload: unknown): payload is VerifiedPayment {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "verified" in payload &&
    payload.verified === true &&
    "fulfillmentMethod" in payload &&
    (payload.fulfillmentMethod === "Porter (manual booking)" ||
      payload.fulfillmentMethod === "Courier (manual booking)") &&
    "distanceKm" in payload &&
    typeof payload.distanceKm === "number" &&
    Number.isFinite(payload.distanceKm) &&
    payload.distanceKm >= 0
  );
}

async function verifyPayment(payment: PaymentResponse) {
  if (!checkoutApiUrl) throw new Error("Online checkout is not set up yet. Please contact the shop to place your order.");

  const response = await fetch(`${checkoutApiUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payment),
  });
  const confirmation = await readApiResponse(response, isVerifiedPayment);
  paymentConfirmed = true;
  cart = [];
  saveCart();
  renderCart();
  setStatus(
    `Payment saved · order ${payment.razorpay_order_id} · ${confirmation.fulfillmentMethod} · approximately ${confirmation.distanceKm.toFixed(2)} km.`,
    "success",
  );
}

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  if (!checkoutApiUrl) {
    setStatus("Online checkout is not set up yet. Please contact the shop to place your order.", "error");
    return;
  }

  const items = cart
    .filter((item) => item.quantity > 0)
    .map(({ id, quantity, flavour, wrapper }) => ({ id, quantity, flavour, wrapper }));
  if (items.length === 0) return;

  const formData = new FormData(checkoutForm);
  const customer = {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    policyConsent: formData.get("policyConsent") === "on",
  };
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
    setStatus("Enter valid latitude and longitude for the delivery address pin.", "error");
    return;
  }
  checkoutButton.disabled = true;
  setStatus("Preparing your secure checkout…");

  try {
    const orderResponse = await fetch(`${checkoutApiUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, customer, deliveryLocation }),
    });
    const order = await readApiResponse(orderResponse, isPaymentOrder);
    await loadRazorpay();

    if (!window.Razorpay) throw new Error("Razorpay checkout is not available. Please try again.");

    setStatus(
      `About ${order.distanceKm.toFixed(2)} km in a straight line · ${order.fulfillmentMethod}. The shop will confirm delivery details.`,
    );
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Chocolate Circle",
      description: "Handmade chocolate order",
      order_id: order.id,
      prefill: {
        name: String(customer.name ?? ""),
        email: String(customer.email ?? ""),
        contact: String(customer.phone ?? ""),
      },
      handler: (payment) => {
        setStatus("Payment received. Verifying securely…");
        void verifyPayment(payment).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Payment verification failed. Please contact the shop.";
          setStatus(message, "error");
        });
      },
      modal: {
        ondismiss: () => setStatus("Checkout closed. Your bag is saved whenever you’re ready."),
      },
      theme: { color: "#624234" },
    });
    checkout.on("payment.failed", (details) => {
      setStatus(details.error?.description || "Payment did not go through. Please try another method.", "error");
    });
    checkout.open();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be started. Please try again.";
    setStatus(message, "error");
  } finally {
    checkoutButton.disabled = false;
  }
});

renderCart();
