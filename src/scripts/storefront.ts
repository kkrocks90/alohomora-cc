import { CART_STORAGE_KEY, loadCart, productById, saveCart, type CartItem } from "./cart";
import {
  answersKey,
  fetchCustomFields,
  fieldAppliesToProduct,
  readCustomAnswers,
  renderCustomFields,
  type CustomField,
} from "./custom-fields";

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The storefront is missing the required ${selector} element.`);
  return element;
}

const openCartButton = requireElement<HTMLButtonElement>("#open-cart");
const closeCartButton = requireElement<HTMLButtonElement>("#close-cart");
const cartDrawer = requireElement<HTMLElement>("#cart-drawer");
const backdrop = requireElement<HTMLElement>("#drawer-backdrop");
const cartItems = requireElement<HTMLElement>("#cart-items");
const cartSummary = requireElement<HTMLElement>("#cart-summary");
const emptyCart = requireElement<HTMLElement>("#empty-cart");
const cartTotal = requireElement<HTMLElement>("#cart-total");
const checkoutLink = requireElement<HTMLAnchorElement>("#proceed-to-checkout");
const bagCount = requireElement<HTMLElement>("#bag-count");
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

let cart: CartItem[] = loadCart();
let previousFocus: HTMLElement | null = null;

function getCartItemKey(item: Pick<CartItem, "id" | "flavour" | "wrapper" | "custom">) {
  return JSON.stringify([item.id, item.flavour, item.wrapper, answersKey(item.custom)]);
}

let productFields: CustomField[] = [];
const customFieldsContainer = document.querySelector<HTMLElement>("#product-custom-fields");
const productAddButton = document.querySelector<HTMLButtonElement>("[data-add-to-cart]");
const checkoutApi = document.querySelector<HTMLElement>("#storefront")?.dataset.checkoutApi ?? "";
if (customFieldsContainer && productAddButton) {
  const product = productById.get(productAddButton.dataset.addToCart ?? "");
  productAddButton.disabled = true;
  fetchCustomFields(checkoutApi)
    .then((fields) => {
      productFields = product ? fields.filter((field) => fieldAppliesToProduct(field, product)) : [];
      renderCustomFields(customFieldsContainer, productFields);
    })
    .catch((error: unknown) => console.error("Could not load the extra product fields.", error))
    .finally(() => {
      productAddButton.disabled = false;
    });
}

function renderCart() {
  cartItems.replaceChildren();
  const entries = cart.filter((item) => productById.has(item.id) && item.quantity > 0);
  const count = entries.reduce((sum, item) => sum + item.quantity, 0);
  const total = entries.reduce((sum, item) => sum + productById.get(item.id)!.price * item.quantity, 0);

  bagCount.textContent = String(count);
  openCartButton.setAttribute("aria-label", `Your shopping bag, ${count} ${count === 1 ? "item" : "items"}`);
  emptyCart.hidden = entries.length > 0;
  cartSummary.hidden = entries.length === 0;
  cartTotal.textContent = currency.format(total);
  checkoutLink.setAttribute("aria-disabled", String(entries.length === 0));
  if (entries.length === 0) emptyCart.textContent = "Your bag is waiting for something lovely.";

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
    copy.append(name);
    if (item.flavour) {
      const flavour = document.createElement("span");
      flavour.textContent = `Flavour: ${item.flavour}`;
      copy.append(flavour);
    }
    if (item.wrapper) {
      const wrapper = document.createElement("span");
      wrapper.textContent = `Wrapper: ${item.wrapper}`;
      copy.append(wrapper);
    }
    for (const answer of item.custom ?? []) {
      const extra = document.createElement("span");
      extra.textContent = `${answer.label}: ${answer.text}`;
      copy.append(extra);
    }
    copy.append(price);

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
    decrease.dataset.productCustom = JSON.stringify(item.custom ?? []);
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
    increase.dataset.productCustom = JSON.stringify(item.custom ?? []);
    controls.append(decrease, amount, increase);
    row.append(copy, controls);
    cartItems.append(row);
  }
}

function openCart() {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
  cartDrawer.inert = false;
  backdrop.hidden = false;
  openCartButton.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  closeCartButton.focus();
}

function closeCart() {
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
  cartDrawer.inert = true;
  backdrop.hidden = true;
  openCartButton.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  previousFocus?.focus();
}

openCartButton.addEventListener("click", openCart);
closeCartButton.addEventListener("click", closeCart);
backdrop.addEventListener("click", closeCart);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cartDrawer.classList.contains("is-open")) closeCart();
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const addButton = event.target.closest<HTMLButtonElement>("[data-add-to-cart]");
  if (addButton) {
    const id = addButton.dataset.addToCart;
    const product = id ? productById.get(id) : undefined;
    if (!id || !product) throw new Error(`Unknown product in storefront: ${id ?? "missing id"}`);
    const optionsForm = addButton.closest<HTMLFormElement>("#product-options-form");
    if (!optionsForm || !optionsForm.reportValidity()) return;
    const formData = new FormData(optionsForm);
    const quantity = Number(formData.get("quantity"));
    const flavour = String(formData.get("flavour") ?? "");
    const wrapper = String(formData.get("wrapper") ?? "").trim();
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error("Choose a quantity between 1 and 20.");
    }
    const hasValidFlavour = product.flavours.length > 0
      ? product.flavours.includes(flavour)
      : flavour === "";
    const customizable = product.customizable !== false;
    const hasValidWrapper = wrapper === "";
    if (!hasValidFlavour || !hasValidWrapper) {
      throw new Error("Please choose an available flavour.");
    }

    let custom;
    try {
      custom = customFieldsContainer ? readCustomAnswers(customFieldsContainer, productFields) : [];
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Please complete the extra details.");
      return;
    }
    const newItem: CartItem = { id, quantity, flavour, wrapper, ...(custom.length > 0 ? { custom } : {}) };
    const existingItem = cart.find((item) => getCartItemKey(item) === getCartItemKey(newItem));
    if (existingItem) existingItem.quantity = Math.min(existingItem.quantity + quantity, 20);
    else cart.push(newItem);
    saveCart(cart);
    renderCart();
    openCart();
    return;
  }

  const quantityButton = event.target.closest<HTMLButtonElement>("[data-cart-action]");
  const id = quantityButton?.dataset.productId;
  const flavour = quantityButton?.dataset.productFlavour;
  const wrapper = quantityButton?.dataset.productWrapper;
  if (!quantityButton || !id || typeof flavour !== "string" || typeof wrapper !== "string" || !productById.has(id)) return;
  let custom: CartItem["custom"];
  try {
    custom = JSON.parse(quantityButton.dataset.productCustom || "[]") as CartItem["custom"];
  } catch {
    return;
  }
  const item = cart.find((entry) => getCartItemKey(entry) === getCartItemKey({ id, flavour, wrapper, custom }));
  if (!item) return;
  item.quantity = quantityButton.dataset.cartAction === "increase"
    ? Math.min(item.quantity + 1, 20)
    : Math.max(item.quantity - 1, 0);
  if (item.quantity === 0) cart = cart.filter((entry) => entry !== item);
  saveCart(cart);
  renderCart();
});

checkoutLink.addEventListener("click", (event) => {
  if (cart.length === 0) event.preventDefault();
});

window.addEventListener("storage", (event) => {
  if (event.key !== CART_STORAGE_KEY) return;
  cart = loadCart();
  renderCart();
});

renderCart();
