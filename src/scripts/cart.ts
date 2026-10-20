import products from "../data/products.json";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  tag: string;
  packSize: string;
  flavours: string[];
  featured?: boolean;
  customizable?: boolean;
}

export interface CartItem {
  id: string;
  quantity: number;
  flavour: string;
  wrapper: string;
}

export const CART_STORAGE_KEY = "cocoa-kind-cart-v1";
export const CUSTOMER_SESSION_KEY = "cocoa-kind-customer-session";
export const ADMIN_SESSION_KEY = "cocoa-kind-admin-session";

export function getCustomerSessionToken(): string {
  const rememberedToken = localStorage.getItem(CUSTOMER_SESSION_KEY) ?? "";
  if (/^[0-9a-f]{64}$/.test(rememberedToken)) return rememberedToken;

  const sessionToken = sessionStorage.getItem(CUSTOMER_SESSION_KEY) ?? "";
  return /^[0-9a-f]{64}$/.test(sessionToken) ? sessionToken : "";
}

export function saveCustomerSessionToken(token: string, rememberMe: boolean) {
  localStorage.removeItem(CUSTOMER_SESSION_KEY);
  sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
  if (rememberMe) localStorage.setItem(CUSTOMER_SESSION_KEY, token);
  else sessionStorage.setItem(CUSTOMER_SESSION_KEY, token);
}

export function clearCustomerSessionToken() {
  localStorage.removeItem(CUSTOMER_SESSION_KEY);
  sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
}

export const productById = new Map<string, Product>(
  products.map((product): [string, Product] => [product.id, product]),
);

export function loadCart(): CartItem[] {
  const saved = localStorage.getItem(CART_STORAGE_KEY);
  if (!saved) return [];

  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) {
    localStorage.removeItem(CART_STORAGE_KEY);
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
      (productById.get(item.id)!.customizable === false
        ? item.wrapper === ""
        : item.wrapper.trim().length >= 3 && item.wrapper.trim().length <= 120),
    ),
  );
}

export function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}
