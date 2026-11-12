import { getImage } from "astro:assets";
import { productGallery } from "../lib/product-images";
import products from "../data/products.json";

// Maps each bundled product photo name to its optimised URL so the admin screens can show photos.
export async function GET() {
  const map: Record<string, string> = {};
  for (const product of products) {
    const names = product.images?.length ? product.images : [product.image];
    const gallery = productGallery(product);
    for (const [index, image] of gallery.entries()) {
      if (typeof image === "string") continue;
      const optimized = await getImage({ src: image, width: 800, format: "webp", quality: 80 });
      map[names[index]!] = optimized.src;
    }
  }
  return new Response(JSON.stringify(map), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
