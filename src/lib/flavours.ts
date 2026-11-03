import flavours from "../data/flavours.json";

const extras = new Map<string, number>(flavours.map((flavour) => [flavour.name, flavour.extra]));

export function flavourExtra(name: string): number {
  return extras.get(name) ?? 0;
}

export function unitPrice(product: { price: number }, flavour: string): number {
  return Math.round((product.price * (100 + flavourExtra(flavour))) / 100);
}
