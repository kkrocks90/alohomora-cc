# Chocolate Circle chocolate shop

A fast, static Astro storefront for Chocolate Circle (https://chocolatecircle.in), backed by a Cloudflare Worker with D1 and R2 for checkout, accounts, admin, promos, payment links and the product catalogue. For behaviour and rules, see [docs/FUNCTIONAL_SPEC.md](docs/FUNCTIONAL_SPEC.md); for release history, see [CHANGELOG.md](CHANGELOG.md).

| Part | Technology |
| --- | --- |
| Site | Astro + Tailwind CSS, static HTML |
| Hosting | GitHub Pages on the custom domain, deployed manually by GitHub Actions |
| API | Cloudflare Worker (`worker/`) |
| Database and images | Cloudflare D1 (`cocoa-kind-orders`) and R2 (`chocolate-circle-images`) |
| Payments | Razorpay (checkout and admin payment links) |
| Email | Resend (sign-in codes, order emails, corporate enquiries) |

## Run locally

Install Node.js 22 or newer, then:

```sh
npm ci
npm run dev      # local site
npm test         # Worker unit tests
npm run build    # production build
```

## Products and catalogue

Products and categories are managed in the admin **Products** tab (`/admin/`) and stored in D1, with up to 3 photos per product in R2. `npm run build` runs `scripts/fetch-catalogue.mjs`, which pulls the live catalogue from the Worker (`GET /products`) and falls back to the bundled `src/data/products.json` and `src/data/categories.json`. Prices are whole Indian rupees. Saving a product triggers a Pages rebuild when the `GITHUB_DISPATCH_TOKEN` Worker secret is set; otherwise use **Publish to storefront** or run the Pages workflow. Order prices always come from D1 immediately.

Before launch, verify names, prices, ingredient and allergen details, storage, delivery, contact and food-licence details, and complete the policy pages (`/terms-and-conditions/`, `/privacy-policy/`, `/shipping-policy/`).

## Themes

The site has a base theme and seasonal themes: `diwali` (the default fallback), `monsoon`, `christmas`, `republic-day`, `pongal`, `birthday`, `independence-day` and `valentines-day`. A theme changes colours, header garland, ribbon banner, hero banner, footer and store toolbar. Themes live in `src/config/theme.ts` and `src/styles/themes/`.

- Pick a theme when you run the **Deploy website to GitHub Pages** workflow (the `theme` dropdown). `repo-setting` uses the `SITE_THEME` repository variable.
- To go back to the base theme, deploy with `theme=default` or set `SITE_THEME` to `default`.
- To add a theme, add an entry in `theme.ts`, a stylesheet scoped to `html[data-theme="<id>"]`, and import it in `src/layouts/SiteLayout.astro`. Add the id to the workflow's `theme` options.

## Accounts, orders and admin

- Customers sign in with a one-time email code before checkout. Codes expire after 10 minutes and sessions after 30 days. Profile details prefill checkout, and **My orders** lists recent orders.
- Checkout validates a six-digit PIN code (city and state autofill from India Post data and OpenStreetMap Nominatim) and labels delivery as Porter within 30 km or courier beyond. Both are booked manually. The Worker verifies the Razorpay signature, payment status and amount before saving an order in D1, and prices always come from the catalogue.
- Order and enquiry emails go to the shop and to the customer through Resend.
- The admin workspace at `/admin/` is limited to `ADMIN_EMAIL` in `worker/wrangler.toml`. It manages orders (status, edit and invoices), customers, manual orders (custom items, an optional discount, partial payments and Razorpay payment links), promo codes, custom checkout fields and products.
- A sitewide flat percentage discount (admin Promos tab) applies automatically at checkout, is advertised on the home page, and pauses promo codes while live.
- Flavours have a master list in the admin with an optional extra percentage each (can be 0, includes "Assorted"); the percentage is added to the product price and shown on the product page.
- Promo codes can be a percentage (all products, a category or a product) or a fixed amount above a minimum, with an optional end date and redemption limit. Fully covered orders skip Razorpay.
- Invoices are order receipts, not GST tax invoices, and do not include delivery charges. **Do not accept live payments until the shipping fee is shown and included in the amount charged**; payments currently cover the product subtotal only.

## Deploying

Deploy only when you intend to publish. The order is: apply migrations, deploy the Worker, run the Pages workflow.

1. Apply D1 migrations:

   ```sh
   npx wrangler d1 migrations apply cocoa-kind-orders --remote --config worker/wrangler.toml
   ```

2. Deploy the Worker with `npm run worker:deploy`, or run the **Deploy Worker to Cloudflare** workflow in GitHub Actions. The workflow needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and can apply pending migrations first.
3. Run the **Deploy website to GitHub Pages** workflow and choose a theme. In **Settings > Pages**, the source must be **GitHub Actions**. `site` and `base` in `astro.config.mjs` are set for `https://chocolatecircle.in/`.

### One-time Cloudflare and payment setup

1. Create the database: `npx wrangler d1 create cocoa-kind-orders`, then copy its `database_id` into `worker/wrangler.toml`. Set `STORE_LATITUDE` and `STORE_LONGITUDE` there to the shop's coordinates. Create the R2 bucket `chocolate-circle-images` and set `IMAGE_BASE_URL`.
2. Set `ALLOWED_ORIGIN` in `worker/wrangler.toml` to the site origin (currently `https://chocolatecircle.in`, without a path). For local testing use a localhost origin temporarily and restore it before deploying.
3. Add Worker secrets with Wrangler, which prompts for each value. Never paste secrets into the repository, GitHub variables or website code:

   ```sh
   npx wrangler secret put RAZORPAY_KEY_ID --config worker/wrangler.toml
   npx wrangler secret put RAZORPAY_KEY_SECRET --config worker/wrangler.toml
   npx wrangler secret put RAZORPAY_WEBHOOK_SECRET --config worker/wrangler.toml
   npx wrangler secret put RESEND_API_KEY --config worker/wrangler.toml
   npx wrangler secret put AUTH_TOKEN_SECRET --config worker/wrangler.toml
   npx wrangler secret put ORS_API_KEY --config worker/wrangler.toml   # optional: OpenRouteService road distance (free key at openrouteservice.org)
   npx wrangler secret put GITHUB_DISPATCH_TOKEN --config worker/wrangler.toml
   ```

   `AUTH_TOKEN_SECRET` must be a random string of at least 32 characters. `GITHUB_DISPATCH_TOKEN` is optional and enables the automatic rebuild after catalogue changes.
4. Verify a domain in Resend and set `LOGIN_FROM_EMAIL` in `worker/wrangler.toml` to a sender on that domain.
5. In Razorpay, add a webhook to `<worker-url>/razorpay/webhook` for `payment_link.paid`, using the same secret as `RAZORPAY_WEBHOOK_SECRET`. Start with test keys, test a full payment, then switch to live keys.
6. Add the Worker URL as the GitHub Actions variable `PUBLIC_CHECKOUT_API_URL` (for example `https://cocoa-kind-checkout.<subdomain>.workers.dev`). It is public. Optionally set `SITE_THEME`.

Payment processing is not free: Razorpay charges its transaction fees. GitHub Pages and Cloudflare Workers have free plans with usage limits; check [Cloudflare D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/) before relying on them. Restrict Cloudflare account access to trusted operators.

## Reports and backups

Run SQL in **Cloudflare Dashboard > Workers & Pages > D1 > cocoa-kind-orders > Console**. For example:

```sql
SELECT substr(created_at, 1, 7) AS month, count(*) AS orders, sum(amount_paise) / 100.0 AS sales_inr
FROM orders
WHERE payment_status = 'paid'
GROUP BY month
ORDER BY month DESC;
```

Export a backup periodically and keep it protected, because it contains customer personal information:

```sh
npx wrangler d1 export cocoa-kind-orders --remote --output=cocoa-kind-orders-backup.sql --config worker/wrangler.toml
```

Set and follow an order-data retention period that meets your legal recordkeeping requirements.

## Social sharing and Meta ads

Public pages include canonical URLs and Open Graph and Twitter metadata, with the default share image at `public/social-share.jpg`. Account, checkout, admin and thank-you pages are `noindex`. The sitemap is `https://chocolatecircle.in/sitemap.xml`; submit it in Google Search Console after deploying.

For Meta Ads or boosted posts, link to a shop page with UTM tags, for example `https://chocolatecircle.in/store/?utm_source=instagram&utm_medium=paid_social&utm_campaign=campaign_name`. The site does not install Meta Pixel or analytics. Add one only after deciding how visitor consent works, and update the Privacy Policy at the same time.
