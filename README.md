# Cocoa & Kind chocolate shop

A fast, static Astro storefront for a small handmade-chocolate business. The sample shop name, descriptions, prices, and illustrated wrappers are placeholders; update them before publishing. Product details live in one JSON file. The supplied illustrations are lightweight SVGs; Astro creates responsive WebP variants at build time when you add raster product photographs.

## Run and edit the shop

Install Node.js 22 or newer, then run:

```sh
npm ci
npm run dev
```

Edit `src/data/products.json` to add or change products. Prices are whole Indian rupees. For each product, add a matching image under `src/assets/products/`; use a `.jpg`, `.png`, or `.webp` image instead of the sample `.svg` when you have product photography. Astro generates responsive, optimized WebP images from raster photos during the site build; SVG illustrations remain vector artwork. Keep product IDs unique, and use the same file name in the JSON `image` field.

Before launch, replace the sample name, product details, and illustrations with accurate business and product information. Add verified ingredient/allergen, weight, storage, delivery, contact, and applicable food-license details and customer policies. Change the shop name in `src/layouts/SiteLayout.astro`, `src/pages/index.astro`, and `src/scripts/storefront.ts`; update the brand colors and layout in `src/styles/global.css`.

Draft policy pages are available at `/terms-and-conditions/`, `/privacy-policy/`, and `/shipping-policy/`. They are linked in the footer and at checkout. Checkout requires customers to accept the linked policies, and records that acceptance in the Razorpay order notes. Before accepting real payments, replace every bracketed prompt with accurate business, privacy, cancellation/refund, and delivery details; review the drafts for applicable law. **Do not accept live payments until the shipping fee is shown and included in the amount charged.** The current payment integration charges the product subtotal only and does not calculate shipping.

## Delivery-distance estimate

The checkout uses the browser's built-in geolocation (with the customer's permission) or coordinates they enter for their delivery pin. The Cloudflare Worker calculates straight-line distance against the configured shop coordinates, marks orders within 15 km for Porter, and marks orders beyond 15 km for a courier. These are manual fulfillment labels only: the worker does not book either service. No geocoding or distance API, API key, or paid mapping service is used; customer delivery coordinates are not sent to a mapping provider or included in Razorpay order notes.

Before deploying the worker, replace `STORE_LATITUDE` and `STORE_LONGITUDE` in `worker/wrangler.toml` with the shop's actual decimal GPS coordinates (for example, `12.345678`). Leave the placeholders until you know the right pin; checkout safely reports that distance checking is not configured rather than charging for an order using a made-up location. Customers can use the location button while physically at the delivery address, or get the pin coordinates from a map and enter them. Geolocation and entered coordinates are customer-provided estimates and can be inaccurate; verify the address when booking delivery.

## Free hosting

The GitHub Actions workflow builds the site and publishes it to GitHub Pages whenever `main` is updated. On GitHub Free, the repository must be public to use Pages. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. The workflow is configured for `https://kkrocks90.github.io/alohomora-cc/`; change `site` and `base` in `astro.config.mjs` if you use another GitHub account, repository name, or custom domain.

## Razorpay checkout

GitHub Pages serves static files only. The `worker/` Cloudflare Worker creates Razorpay orders using server-side secrets, verifies payment signatures, and checks payment capture status. Customer name, phone, email, delivery address, and item names are attached to the Razorpay order notes for fulfillment. No order database or automated confirmation email is included; manage paid orders from the Razorpay dashboard and follow up with the customer. Product prices are checked against `src/data/products.json` on the server, not accepted from the browser.

1. Create a Cloudflare account and a Razorpay account. Start with Razorpay test keys.
2. Set `ALLOWED_ORIGIN` in `worker/wrangler.toml` to the website's origin (for example, `https://kkrocks90.github.io`; do not include the repository path).
3. In a terminal, from the repository root, deploy the Worker:

   ```sh
   npm ci
   npm run worker:deploy
   ```

4. Add the Razorpay test credentials as Worker secrets; Wrangler prompts for the values:

   ```sh
   npx wrangler secret put RAZORPAY_KEY_ID --config worker/wrangler.toml
   npx wrangler secret put RAZORPAY_KEY_SECRET --config worker/wrangler.toml
   ```

5. Copy the deployed Worker URL and add it to the repository under **Settings → Secrets and variables → Actions → Variables** as `PUBLIC_CHECKOUT_API_URL` (for example, `https://cocoa-kind-checkout.<your-subdomain>.workers.dev`). The value is public; never put a Razorpay secret in a GitHub variable, site file, or browser code.
6. Redeploy the Pages workflow. Test a complete payment with Razorpay test mode before switching the Worker secrets to live keys.

Payment processing is not free: Razorpay charges its applicable transaction fees. GitHub Pages and Cloudflare Workers have free plans, each with their own usage limits. Until the Worker URL and Razorpay keys are configured, the storefront remains viewable but checkout clearly reports that it is not ready.
