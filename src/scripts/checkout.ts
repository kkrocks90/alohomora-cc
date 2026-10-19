import {
  CART_STORAGE_KEY,
  clearCustomerSessionToken,
  getCustomerSessionToken,
  loadCart,
  productById,
  saveCustomerSessionToken,
  saveCart,
  type CartItem,
} from "./cart";
import { initializePincodeLookup } from "./pincode-lookup";
import { normalizeState } from "../data/indian-states";

interface PaymentOrder {
  id: string;
  amount: number;
  currency: "INR";
  keyId: string;
  fulfillmentMethod: "Porter (manual booking)" | "Courier (manual booking)";
  distanceKm: number;
  promoReservationId: string;
}

interface AppliedPromo {
  code: string;
  name: string;
  subtotalPaise: number;
  eligibleSubtotalPaise: number;
  discountPaise: number;
  payablePaise: number;
  cartSignature: string;
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
const rememberMeInput = requireElement<HTMLInputElement>("#checkout-remember-me");
const loginStatus = requireElement<HTMLElement>("#checkout-login-status");
const checkoutForm = requireElement<HTMLFormElement>("#checkout-form");
const profileSetup = requireElement<HTMLElement>("#checkout-profile-setup");
const profileForm = requireElement<HTMLFormElement>("#checkout-profile-form");
const profileStatus = requireElement<HTMLElement>("#checkout-profile-status");
const eventDateInput = requireElement<HTMLInputElement>("#checkout-form input[name=eventDate]");
const checkoutStatus = requireElement<HTMLElement>("#checkout-status");
const checkoutButton = requireElement<HTMLButtonElement>("#checkout-button");
const signedInEmail = requireElement<HTMLElement>("#checkout-signed-in");
const signOutButton = requireElement<HTMLButtonElement>("#checkout-sign-out");
const orderItems = requireElement<HTMLElement>("#checkout-order-items");
const orderTotal = requireElement<HTMLElement>("#checkout-total");
const payableTotal = requireElement<HTMLElement>("#checkout-payable");
const discountRow = requireElement<HTMLElement>("#checkout-discount-row");
const discountTotal = requireElement<HTMLElement>("#checkout-discount");
const promoForm = requireElement<HTMLFormElement>("#checkout-promo-form");
const promoInput = requireElement<HTMLInputElement>("#checkout-promo-code");
const promoApplyButton = requireElement<HTMLButtonElement>("#checkout-promo-apply");
const promoStatus = requireElement<HTMLElement>("#checkout-promo-status");
const promoRemoveButton = requireElement<HTMLButtonElement>("#checkout-promo-remove");
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

let cart: CartItem[] = loadCart();
let customerEmail = "";
let sessionToken = "";
let profileComplete = false;
let appliedPromo: AppliedPromo | null = null;

function initializeFormPincodeLookup(form: HTMLFormElement) {
  const city = form.elements.namedItem("city");
  const state = form.elements.namedItem("state");
  const pincode = form.elements.namedItem("pincode");
  const status = form.querySelector<HTMLElement>("[data-pincode-status]");
  if (!(city instanceof HTMLInputElement) || !(state instanceof HTMLSelectElement) ||
      !(pincode instanceof HTMLInputElement) || !status) {
    throw new Error("The address form is incomplete.");
  }
  initializePincodeLookup({ apiUrl, city, state, pincode, status });
}

initializeFormPincodeLookup(profileForm);
initializeFormPincodeLookup(checkoutForm);

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

function setPromoStatus(message: string, error = false) {
  promoStatus.textContent = message;
  promoStatus.dataset.state = error ? "error" : "success";
}

function getCartSignature() {
  return JSON.stringify(cart.map(({ id, quantity }) => [id, quantity]).sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function renderPromoSummary(subtotalPaise: number) {
  const validPromo = appliedPromo && appliedPromo.cartSignature === getCartSignature() &&
    appliedPromo.subtotalPaise === subtotalPaise;
  if (appliedPromo && !validPromo) {
    appliedPromo = null;
    promoInput.value = "";
    setPromoStatus("Your bag changed, so apply the code again.");
  }
  discountRow.hidden = !validPromo;
  discountTotal.textContent = `−${currency.format((validPromo ? appliedPromo.discountPaise : 0) / 100)}`;
  payableTotal.textContent = currency.format((validPromo ? appliedPromo.payablePaise : subtotalPaise) / 100);
  promoRemoveButton.hidden = !validPromo;
  promoApplyButton.disabled = Boolean(validPromo);
  promoInput.disabled = Boolean(validPromo);
}

function getToken() {
  return getCustomerSessionToken();
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
      clearCustomerSessionToken();
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
  profileSetup.hidden = true;
  emailForm.hidden = false;
  codeForm.hidden = true;
}

function setProfileStatus(message: string, error = false) {
  profileStatus.textContent = message;
  profileStatus.dataset.state = error ? "error" : "success";
}

function renderOrder() {
  cart = loadCart();
  orderItems.replaceChildren();
  const subtotalPaise = cart.reduce((sum, item) => sum + productById.get(item.id)!.price * item.quantity * 100, 0);
  orderTotal.textContent = currency.format(subtotalPaise / 100);
  renderPromoSummary(subtotalPaise);
  emptyPanel.hidden = cart.length > 0;
  loginPanel.hidden = cart.length === 0 || Boolean(customerEmail);
  profileSetup.hidden = cart.length === 0 || !customerEmail || profileComplete;
  checkoutContent.hidden = cart.length === 0 || !customerEmail || !profileComplete;

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

promoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!promoForm.reportValidity()) return;
  const code = promoInput.value.trim();
  if (!code) {
    setPromoStatus("Enter a promo code first.", true);
    return;
  }
  appliedPromo = null;
  renderOrder();
  promoApplyButton.disabled = true;
  setPromoStatus("Checking your promo code…");
  try {
    const result = await requestApi("/promos/quote", {
      code,
      items: cart.map(({ id, quantity }) => ({ id, quantity })),
    });
    if (
      typeof result.code !== "string" ||
      typeof result.name !== "string" ||
      !Number.isSafeInteger(result.subtotalPaise) ||
      !Number.isSafeInteger(result.eligibleSubtotalPaise) ||
      !Number.isSafeInteger(result.discountPaise) ||
      !Number.isSafeInteger(result.payablePaise) ||
      result.subtotalPaise !== cart.reduce((sum, item) => sum + productById.get(item.id)!.price * item.quantity * 100, 0) ||
      result.discountPaise < 0 ||
      result.discountPaise > result.subtotalPaise ||
      result.payablePaise !== result.subtotalPaise - result.discountPaise
    ) throw new Error("The checkout service returned invalid promo details.");
    appliedPromo = {
      code: result.code,
      name: result.name,
      subtotalPaise: result.subtotalPaise,
      eligibleSubtotalPaise: result.eligibleSubtotalPaise,
      discountPaise: result.discountPaise,
      payablePaise: result.payablePaise,
      cartSignature: getCartSignature(),
    };
    promoInput.value = result.code;
    setPromoStatus(`${result.name} applied. You save ${currency.format(result.discountPaise / 100)}.`);
    renderOrder();
  } catch (error) {
    setPromoStatus(error instanceof Error ? error.message : "Could not apply that promo code.", true);
  } finally {
    promoApplyButton.disabled = Boolean(appliedPromo);
  }
});

promoRemoveButton.addEventListener("click", () => {
  appliedPromo = null;
  promoInput.value = "";
  renderOrder();
  setPromoStatus("Promo code removed.");
});

async function loadSession(token: string) {
  sessionToken = token;
  const result = await requestApi("/auth/orders", undefined, token);
  if (typeof result.email !== "string") throw new Error("Sign-in returned an invalid email address.");
  if (result.isAdmin === true) {
    clearCustomerSessionToken();
    window.dispatchEvent(new Event("customer-session-change"));
    throw new Error("Please sign in to the admin workspace at /admin/.");
  }
  customerEmail = result.email;
  const profile = isRecord(result.profile) ? result.profile : {};
  const name = typeof profile.name === "string" ? profile.name : "";
  const phone = typeof profile.phone === "string" ? profile.phone : "";
  const address = typeof profile.address === "string" ? profile.address : "";
  const city = typeof profile.city === "string" ? profile.city : "";
  const state = typeof profile.state === "string" ? normalizeState(profile.state) : "";
  const pincode = typeof profile.pincode === "string" ? profile.pincode : "";
  profileComplete = Boolean(name.trim() && phone.trim() && address.trim() && city.trim() && state.trim() && /^[1-9][0-9]{5}$/.test(pincode));
  const setupName = profileForm.elements.namedItem("name");
  const setupPhone = profileForm.elements.namedItem("phone");
  const setupAddress = profileForm.elements.namedItem("address");
  const setupCity = profileForm.elements.namedItem("city");
  const setupState = profileForm.elements.namedItem("state");
  const setupPincode = profileForm.elements.namedItem("pincode");
  const checkoutName = checkoutForm.elements.namedItem("name");
  const checkoutPhone = checkoutForm.elements.namedItem("phone");
  const checkoutAddress = checkoutForm.elements.namedItem("address");
  const checkoutCity = checkoutForm.elements.namedItem("city");
  const checkoutState = checkoutForm.elements.namedItem("state");
  const checkoutPincode = checkoutForm.elements.namedItem("pincode");
  if (
    setupName instanceof HTMLInputElement &&
    setupPhone instanceof HTMLInputElement &&
    setupAddress instanceof HTMLTextAreaElement &&
    setupCity instanceof HTMLInputElement &&
    setupState instanceof HTMLSelectElement &&
    setupPincode instanceof HTMLInputElement &&
    checkoutName instanceof HTMLInputElement &&
    checkoutPhone instanceof HTMLInputElement &&
    checkoutAddress instanceof HTMLTextAreaElement &&
    checkoutCity instanceof HTMLInputElement &&
    checkoutState instanceof HTMLSelectElement &&
    checkoutPincode instanceof HTMLInputElement
  ) {
    setupName.value = name;
    setupPhone.value = phone;
    setupAddress.value = address;
    setupCity.value = city;
    setupState.value = state;
    setupPincode.value = pincode;
    checkoutName.value = name;
    checkoutPhone.value = phone;
    checkoutAddress.value = address;
    checkoutCity.value = city;
    checkoutState.value = state;
    checkoutPincode.value = pincode;
  }
  signedInEmail.textContent = `Signed in as ${customerEmail}`;
  setLoginStatus("");
  if (!profileComplete) {
    setProfileStatus("Save your details once, then we’ll prefill them at checkout.");
  } else {
    setProfileStatus("");
  }
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
    await loadSession(result.token);
    saveCustomerSessionToken(result.token, rememberMeInput.checked);
    window.dispatchEvent(new Event("customer-session-change"));
  } catch (error) {
    clearCustomerSessionToken();
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

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!profileForm.reportValidity()) return;
  const formData = new FormData(profileForm);
  const button = profileForm.querySelector<HTMLButtonElement>("button[type=submit]");
  if (button) button.disabled = true;
  setProfileStatus("Saving your details…");
  try {
    await requestApi("/auth/profile/update", {
      name: formData.get("name"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      city: formData.get("city"),
      state: formData.get("state"),
      pincode: formData.get("pincode"),
    });
    await loadSession(sessionToken);
    setCheckoutStatus("Your saved details are ready. You can edit them for this order.");
  } catch (error) {
    setProfileStatus(error instanceof Error ? error.message : "Could not save your details.", true);
  } finally {
    if (button) button.disabled = false;
  }
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
  clearCustomerSessionToken();
  window.dispatchEvent(new Event("customer-session-change"));
  sessionToken = "";
  customerEmail = "";
  profileComplete = false;
  showLogin();
  setLoginStatus(signOutMessage, signOutError);
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
    value.distanceKm >= 0 &&
    typeof value.promoReservationId === "string";
}

async function releasePromoReservation(reservationId: string) {
  if (!reservationId) return;
  try {
    await requestApi("/promos/release", { reservationId });
  } catch {
    setCheckoutStatus("Checkout closed, but the promo could not be released yet. It will become available again shortly.", true);
  }
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
  checkoutButton.disabled = true;
  setCheckoutStatus("Preparing your secure checkout…");
  let activeReservationId = "";
  try {
    const orderResult = await requestApi("/orders", {
      items: cart.map(({ id, quantity, flavour, wrapper }) => ({ id, quantity, flavour, wrapper })),
      promoCode: appliedPromo?.code ?? "",
      customer: {
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        email: customerEmail,
        address: String(formData.get("address") ?? ""),
        city: String(formData.get("city") ?? ""),
        state: String(formData.get("state") ?? ""),
        pincode: String(formData.get("pincode") ?? ""),
        eventDate: String(formData.get("eventDate") ?? ""),
        policyConsent: formData.get("policyConsent") === "on",
      },
    });
    if (
      orderResult.freeOrder === true &&
      orderResult.verified === true &&
      typeof orderResult.orderId === "string"
    ) {
      cart = [];
      saveCart(cart);
      window.location.assign(`${baseUrl}thank-you/?order=${encodeURIComponent(orderResult.orderId)}`);
      return;
    }
    if (!isPaymentOrder(orderResult)) throw new Error("The checkout service returned incomplete payment details.");
    activeReservationId = orderResult.promoReservationId;
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
        activeReservationId = "";
        setCheckoutStatus("Payment received. Verifying securely…");
        void verifyPayment(payment).catch((error: unknown) => {
          setCheckoutStatus(
            error instanceof Error ? error.message : "Payment verification failed. Please contact the shop.",
            true,
          );
        });
      },
      modal: {
        ondismiss: () => {
          setCheckoutStatus("Checkout closed. Your bag is saved whenever you’re ready.");
          void releasePromoReservation(activeReservationId);
          activeReservationId = "";
        },
      },
      theme: { color: "#624234" },
    });
    razorpay.on("payment.failed", (details) => {
      setCheckoutStatus(details.error?.description || "Payment did not go through. Please try another method.", true);
      void releasePromoReservation(activeReservationId);
      activeReservationId = "";
    });
    razorpay.open();
  } catch (error) {
    if (activeReservationId) await releasePromoReservation(activeReservationId);
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
      clearCustomerSessionToken();
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
