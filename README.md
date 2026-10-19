# Chocolate Circle chocolate shop

A fast, static Astro storefront for Chocolate Circle. Product names, listed prices, photographs, and Choco Cubes flavour choices come from the shop's [Jotform order form](https://form.jotform.com/253120957812456). The concise descriptions and browse categories are site copy based on those product names and pack sizes. Product details live in one JSON file, with locally stored photographs optimized by Astro at build time.

## Run and edit the shop

Install Node.js 22 or newer, then run:

```sh
npm ci
npm run dev
```

Edit `src/data/products.json` to add or change products. Prices are whole Indian rupees. Set `"featured": true` to highlight a product on the home page; every product appears in the `/store/` catalog, which supports search, tag filtering, sorting, and infinite scroll with a load-more button. Product flavours are controlled per product by its `flavours` array: list only the flavours available for that product, or use an empty array (`[]`) to hide flavour selection. Chocolate treats currently use Choco Cubes’ Jotform flavour choices; remove unavailable choices from any individual product’s array. Product detail pages also let customers select a quantity from 1 to 20 before adding to the bag. Customers describe their wrapper design (3–120 characters) before adding any product to the bag. Add each product photograph under `src/assets/products/`, keep product IDs unique, and set the matching image file name in the JSON `image` field. Astro generates responsive, optimized WebP images from the local photos at build time.

Before launch, verify all extracted names and prices against the current order form, add accurate ingredient/allergen, product-weight, storage, delivery, contact, and applicable food-license details, and complete the customer policies.

Draft policy pages are available at `/terms-and-conditions/`, `/privacy-policy/`, and `/shipping-policy/`. They are linked in the footer and at checkout. Checkout requires customers to accept the linked policies, and records that acceptance in the Razorpay order notes. Before accepting real payments, replace every bracketed prompt with accurate business, privacy, cancellation/refund, and delivery details; review the drafts for applicable law. **Do not accept live payments until the shipping fee is shown and included in the amount charged.** The current payment integration charges the product subtotal only and does not calculate shipping.

## Delivery-distance estimate

The checkout uses the browser's built-in geolocation (with the customer's permission) or coordinates they enter for their delivery pin. The Cloudflare Worker calculates straight-line distance against the configured shop coordinates, marks orders within 15 km for Porter, and marks orders beyond 15 km for a courier. These are manual fulfillment labels only: the worker does not book either service. No geocoding or distance API, API key, or paid mapping service is used; customer delivery coordinates are not sent to a mapping provider or included in Razorpay order notes.

Before deploying the worker, replace `STORE_LATITUDE` and `STORE_LONGITUDE` in `worker/wrangler.toml` with the shop's actual decimal GPS coordinates (for example, `12.345678`). Leave the placeholders until you know the right pin; checkout safely reports that distance checking is not configured rather than charging for an order using a made-up location. Customers can use the location button while physically at the delivery address, or get the pin coordinates from a map and enter them. Geolocation and entered coordinates are customer-provided estimates and can be inaccurate; verify the address when booking delivery.

## Free paid-order storage and reports

Paid orders are saved to a Cloudflare D1 database through the existing checkout Worker; a customer's browser is never used to write order data. A row is created only after the Worker verifies Razorpay's signature, confirms a captured payment, checks the amount against the product catalog, verifies the delivery-method notes, and confirms the order email matches the signed-in account. Safe verification retries do not create duplicate orders. If the database is not set up, the Worker refuses to start payment. The database stores customer contact and delivery details, itemized products, paid amount, payment and order IDs, estimated delivery distance and method, and the customer's policy acknowledgement. It does not store payment-card information or delivery coordinates.

Customers must sign in with a one-time email code before the checkout form is shown; the Worker also requires a valid signed-in session to create or verify payments. New customers save their name, mobile number, and default delivery address after sign-in. Those details prefill checkout but can be edited for each order; event dates remain specific to an order. Customers can visit **My orders** to see up to 50 recent orders associated with their email. Codes expire after 10 minutes, are limited to five attempts, and can be requested once per minute per email; sessions expire after 30 days and are stored as hashes. The site is static, so the checkout page itself cannot be private; payment and order APIs enforce the sign-in requirement server-side.

## Admin order management

The private admin workspace is available at `/admin/`. Admin sign-in uses the same email-code flow, and the Worker authorizes management APIs only for `ADMIN_EMAIL` in `worker/wrangler.toml` (currently `alohomora.chocolatecircle@gmail.com`). A successful admin sign-in from the profile page opens the admin workspace. The dashboard lists up to 500 recent orders and saved customers, supports order-status updates, customer creation, and manual unpaid orders, and provides a print-to-PDF invoice/receipt. Non-admin customers are added to the saved customer list when they sign in and their record is enriched with contact details when they order. Customers are identified by email: creating a manual customer with an existing email updates that customer instead of creating a duplicate. A customer signed in with that email can see both paid and manual orders placed under it in their profile. Manual order totals are calculated against the product catalog by the Worker; no payment is initiated. Printed documents are order invoices/receipts, not GST tax invoices, and do not include delivery charges.

Before deploying admin changes, apply all pending D1 migrations with `npx wrangler d1 migrations apply cocoa-kind-orders --remote --config worker/wrangler.toml`, then deploy the Worker with `npm run worker:deploy`. Keep `ADMIN_EMAIL` restricted to the owner’s mailbox.

Cloudflare Workers Free currently includes D1 allowances of 5 million rows read per day, 100,000 rows written per day, and 5 GB of total storage; see [Cloudflare D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/) before relying on a free-plan limit. Check database usage in **Cloudflare Dashboard → Workers & Pages → D1 → cocoa-kind-orders → Metrics**. Restrict access to the Cloudflare account to trusted shop operators. Establish and follow an appropriate order-data retention period; delete records you no longer need, consistent with legal recordkeeping requirements.

To create the free order database before deploying the Worker:

1. From the repository root, create it in the Cloudflare account connected to Wrangler:

   ```sh
   npx wrangler d1 create cocoa-kind-orders
   ```

2. Copy the `database_id` returned by Wrangler into `database_id` in `worker/wrangler.toml`. Replace both store-coordinate placeholders there with the shop's real decimal latitude and longitude.
3. Create the order and customer sign-in tables in the remote D1 database by applying all pending migrations:

   ```sh
   npx wrangler d1 migrations apply cocoa-kind-orders --remote --config worker/wrangler.toml
   ```

4. Deploy the Worker and finish the Razorpay and email setup below. Once payment and D1 are configured, test an order end to end and confirm its `paid` row appears in **Cloudflare Dashboard → Workers & Pages → D1 → cocoa-kind-orders → Console**. If this is the GitHub Pages `main` repository, set `ALLOWED_ORIGIN` to `https://kkrocks90.github.io`. For local testing, use a localhost origin temporarily and restore the live origin before deploying to production.

To generate reports, run SQL in the D1 Console. For example:

```sql
SELECT
  substr(created_at, 1, 7) AS month,
  count(*) AS paid_orders,
  sum(amount_paise) / 100.0 AS sales_inr
FROM orders
GROUP BY month
ORDER BY month DESC;
```

```sql
SELECT
  delivery_method,
  count(*) AS paid_orders,
  sum(amount_paise) / 100.0 AS sales_inr
FROM orders
GROUP BY delivery_method
ORDER BY delivery_method;
```

```sql
SELECT created_at, order_id, customer_name, customer_phone, customer_email,
       delivery_address, items_json, amount_paise / 100.0 AS total_inr,
       delivery_method, distance_km
FROM orders
ORDER BY created_at DESC;
```

For an independent backup, export the D1 database periodically using Wrangler:

```sh
npx wrangler d1 export cocoa-kind-orders --remote --output=cocoa-kind-orders-backup.sql --config worker/wrangler.toml
```

Keep exports protected because they include customer personal information.

## Free hosting

The GitHub Actions workflow builds the site and publishes it to GitHub Pages whenever `main` is updated. On GitHub Free, the repository must be public to use Pages. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. The workflow is configured for `https://kkrocks90.github.io/alohomora-cc/`; change `site` and `base` in `astro.config.mjs` if you use another GitHub account, repository name, or custom domain.

## Razorpay checkout

GitHub Pages serves static files only. The `worker/` Cloudflare Worker creates Razorpay orders using server-side secrets, verifies payment signatures, and checks payment capture status. Once an order is paid and verified, the Worker also saves it in Cloudflare D1 for shop reports and follow-up. Razorpay order notes provide the Worker with the verified order details; product prices are checked against `src/data/products.json` on the server, not accepted from the browser. Resend sends customer sign-in codes; order confirmation and delivery-notification emails are not configured.

1. Create a Cloudflare account, the [D1 database](#free-paid-order-storage-and-reports), and a Razorpay account. Start with Razorpay test keys.
2. Set `ALLOWED_ORIGIN` in `worker/wrangler.toml` to the website's origin (for example, `https://kkrocks90.github.io`; do not include the repository path). The shop coordinates and D1 `database_id` must also be configured before checkout is enabled.
3. From the repository root, deploy the Worker:

   ```sh
   npm ci
   npm run worker:deploy
   ```

4. Add the Razorpay test credentials as Worker secrets; Wrangler prompts for the values:

   ```sh
   npx wrangler secret put RAZORPAY_KEY_ID --config worker/wrangler.toml
   npx wrangler secret put RAZORPAY_KEY_SECRET --config worker/wrangler.toml
   ```

5. Create a [Resend](https://resend.com/) account, verify a domain you control for sending email, and choose a sender address on that verified domain. Replace the `LOGIN_FROM_EMAIL` example in `worker/wrangler.toml` with that sender. Add the Resend API key and a randomly generated secret (at least 32 characters) as Worker secrets:

   ```sh
   npx wrangler secret put RESEND_API_KEY --config worker/wrangler.toml
   npx wrangler secret put AUTH_TOKEN_SECRET --config worker/wrangler.toml
   ```

   Wrangler prompts for each value. Do not paste credentials into this repository, GitHub Actions variables, or customer-facing website code. Resend's free plan and domain-verification requirements may change; check its current limits before relying on it.

6. Copy the deployed Worker URL and add it to the repository under **Settings → Secrets and variables → Actions → Variables** as `PUBLIC_CHECKOUT_API_URL` (for example, `https://cocoa-kind-checkout.<your-subdomain>.workers.dev`). The URL is public; never put a Razorpay or Resend secret in a GitHub variable, site file, or browser code.
7. Redeploy the Pages workflow. Test a complete payment with Razorpay test mode before switching the Worker secrets to live keys, and test customer sign-in with an email address that can receive mail from the verified sender domain.

Payment processing is not free: Razorpay charges its applicable transaction fees. GitHub Pages and Cloudflare Workers have free plans, each with their own usage limits. Until the Worker URL and Razorpay keys are configured, the storefront remains viewable but checkout clearly reports that it is not ready.

## Social sharing and Meta ads

Public pages include canonical URLs and Open Graph/Twitter sharing metadata. The default share image is `public/social-share.jpg` (1200 × 630); account, checkout, admin, and thank-you pages are marked `noindex`.

The generated `sitemap.xml` lists the public shop, policy, About, and product pages, and `robots.txt` points crawlers to it. After deployment, add `https://chocolatecircle.in/` as a property in Google Search Console and submit `https://chocolatecircle.in/sitemap.xml` to request discovery. Search Console does not guarantee indexing or rankings.

For a Meta Ads Manager campaign or an Instagram boosted post, use the relevant shop page as the destination and add consistent UTM tags, for example:

```text
https://chocolatecircle.in/store/?utm_source=instagram&utm_medium=paid_social&utm_campaign=campaign_name&utm_content=ad_or_post_name
```

Replace the campaign and content values with short, consistent names for each campaign and creative. The site does not currently install Meta Pixel or another analytics service, so it does not record website purchases or report UTM-attributed conversions. Add a Meta Pixel only after choosing the Pixel ID and how visitor consent should work; update the Privacy Policy at the same time.
