import products from "../data/products.json";
import hiddenCategories from "../data/hidden-categories.json";

export function GET({ site }: { site: URL }) {
  const hidden = hiddenCategories as string[];
  const categories = [...new Set(products.map((product) => product.tag))]
    .filter((tag) => !hidden.includes(tag))
    .sort((a, b) => a.localeCompare(b));
  const productLines = products
    .filter((product) => !hidden.includes(product.tag))
    .map((product) => `- [${product.name}](${new URL(`/product/${encodeURIComponent(product.id)}/`, site).href}): ${product.tag}, ${product.packSize}, ₹${product.price}`);

  const body = `# Chocolate Circle

> Chocolate Circle is a small-batch handmade chocolate shop based in Chennai, Tamil Nadu, India. It sells handmade chocolate treats, gift hampers, festival specials and bulk or corporate gifting, with delivery across India by courier.

## About
- Operated by Alohomora Chocolate Circle, Chennai.
- Chocolates are made by hand in small batches; a personalised wrapper is available on many products.
- Allow at least 3 to 4 days for preparation. Delivery options and the fee are confirmed after the order is placed, before dispatch.
- Prices are in Indian rupees (INR). Payment is online at checkout.

## Contact
- Email: customer.support@chocolatecircle.in
- WhatsApp: +91 95008 68468

## Key pages
- [Shop all products](${new URL("/store/", site).href})
- [About us](${new URL("/about/", site).href})
- [Corporate and bulk gifting](${new URL("/corporate/", site).href})
- [Contact](${new URL("/contact/", site).href})
- [Shipping policy](${new URL("/shipping-policy/", site).href})
- [Terms and conditions](${new URL("/terms-and-conditions/", site).href})

## Categories
${categories.map((tag) => `- ${tag}`).join("\n")}

## Products
${productLines.join("\n")}
`;

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
