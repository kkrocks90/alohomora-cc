# Cocoa & Kind chocolate shop

A fast, static Astro storefront for a small handmade-chocolate business. The sample shop name, descriptions, prices, and illustrated wrappers are placeholders; update them before publishing. Product details live in one JSON file, and Astro converts the illustrations into optimized WebP images at build time.

## Run and edit the shop

Install Node.js 22 or newer, then run:

```sh
npm install
npm run dev
```

Edit `src/data/products.json` to add or change products. Prices are whole Indian rupees. For each product, add a matching image under `src/assets/products/`; use a `.jpg`, `.png`, or `.webp` image instead of the sample `.svg` when you have product photography. Astro generates responsive, optimized WebP images during the site build. Keep product IDs unique, and use the same file name in the JSON `image` field.

Before launch, replace the sample name, product details, and illustrations with accurate business and product information. Add verified ingredient/allergen, weight, storage, delivery, contact, and applicable food-license details and customer policies. Change the shop name in `src/layouts/SiteLayout.astro`, `src/pages/index.astro`, and `src/scripts/storefront.ts`; update the brand colors and layout in `src/styles/global.css`.

## Free hosting

The GitHub Actions workflow builds the site and publishes it to GitHub Pages whenever `main` is updated. On GitHub Free, the repository must be public to use Pages. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. The workflow is configured for `https://kkrocks90.github.io/alohomora-cc/`; change `site` and `base` in `astro.config.mjs` if you use another GitHub account, repository name, or custom domain.

## Razorpay checkout

GitHub Pages serves static files only. The `worker/` Cloudflare Worker creates Razorpay orders using server-side secrets, verifies payment signatures, and checks payment capture status. Customer name, phone, email, delivery address, and item names are attached to the Razorpay order notes for fulfillment. No order database or automated confirmation email is included; manage paid orders from the Razorpay dashboard and follow up with the customer. Product prices are checked against `src/data/products.json` on the server, not accepted from the browser.

1. Create a Cloudflare account and a Razorpay account. Start with Razorpay test keys.
2. Set `ALLOWED_ORIGIN` in `worker/wrangler.toml` to the website's origin (for example, `https://kkrocks90.github.io`; do not include the repository path).
3. In a terminal, from the repository root, deploy the Worker:

   ```sh
   npm install
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
