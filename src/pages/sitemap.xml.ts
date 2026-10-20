import products from "../data/products.json";

const staticPaths = [
  "/",
  "/store/",
  "/about/",
  "/privacy-policy/",
  "/shipping-policy/",
  "/terms-and-conditions/",
];

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET({ site }: { site: URL }) {
  const urls = [
    ...staticPaths.map((path) => new URL(path, site).href),
    ...products.map((product) => new URL(`/product/${encodeURIComponent(product.id)}/`, site).href),
  ];
  const today = new Date().toISOString().slice(0, 10);
  const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc><lastmod>${today}</lastmod></url>`).join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(sitemap, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
