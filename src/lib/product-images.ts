import type { ImageMetadata } from "astro:assets";

const localImages = import.meta.glob<{ default: ImageMetadata }>("../assets/products/*.{jpg,jpeg,png,webp,svg}", {
  eager: true,
});
const imagesByName = Object.fromEntries(
  Object.entries(localImages).map(([path, image]) => [path.split("/").pop(), image.default]),
);

export type ProductImage = ImageMetadata | string;

interface ImageProduct {
  image: string;
  images?: string[];
}

export function resolveImage(name: string): ProductImage {
  const image = /^https?:\/\//.test(name) ? name : imagesByName[name];
  if (!image) throw new Error(`Product image not found: ${name}`);
  return image;
}

export function productGallery(product: ImageProduct): ProductImage[] {
  const names = product.images?.length ? product.images : [product.image];
  return names.slice(0, 3).map(resolveImage);
}
