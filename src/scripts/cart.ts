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
}

export interface CartItem {
  id: string;
  quantity: number;
  flavour: string;
  wrapper: string;
}

export const CART_STORAGE_KEY = "cocoa-kind-cart-v1";
export const CUSTOMER_SESSION_KEY = "cocoa-kind-customer-session";

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
      item.wrapper.trim().length >= 3 &&
      item.wrapper.trim().length <= 120,
    ),
  );
}

export function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}
