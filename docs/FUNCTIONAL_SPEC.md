# Chocolate Circle - Functional Specification

Status: reflects release **v1.21.1** (October 2026). Source of truth for behaviour is the code and `CHANGELOG.md`; this document describes what the system does and the rules it enforces.

## 1. Overview

Chocolate Circle is a low-cost online shop for handmade chocolates (chocolatecircle.in).

| Layer | Technology | Role |
| --- | --- | --- |
| Storefront | Astro + Tailwind CSS, static HTML | Product catalogue, cart, checkout UI, account, admin UI |
| Hosting | GitHub Pages, deployed by a manual GitHub Actions workflow (`deploy.yml`) | Serves the static site |
| API | Cloudflare Worker (`worker/`) | Checkout, payments, accounts, promos, admin, custom fields, webhook |
| Database | Cloudflare D1 (`cocoa-kind-orders`) | Orders, customers, sessions, promos, custom fields, custom products |
| Payments | Razorpay | Checkout payments, admin payment links, webhook |
| Email | Resend | Login-code emails |
| Location | India Post PIN data + OpenStreetMap Nominatim | PIN -> city/state/approximate location |

Catalogue data lives in `src/data/products.json` and `src/data/categories.json` (to move to D1 - see roadmap).

## 2. Roles

- **Visitor**: browses, adds to bag. Sign-in is required to check out, use promos and see order history.
- **Customer**: signed in by email code. Has a profile, saved address and order history.
- **Admin**: the single email in `ADMIN_EMAIL`. Signs in the same way; the Worker authorises every admin call by comparing the session email to `ADMIN_EMAIL`.

## 3. Storefront

### 3.1 Pages
Home, Store, Product (`/product/<id>`), Checkout, Thank-you, Account/Profile, Order detail (`/order/?id=`), About, Privacy policy, Shipping policy, Terms and conditions, Admin, branded 404, `sitemap.xml`.

### 3.2 Catalogue
- 48 products. Fields: id, name, description, price, image, tag (category), pack size, flavour options, featured flag.
- Optional `extraTags` lets a product appear in more than one category. Optional `customizable: false` hides wrapper customisation.
- Categories include Chocolate treats, Hampers, Kids B'Day Special, Elite Gifting and Bulk Specials (`categories.json`). Categories with no products are hidden on the home page but remain store filters and promo targets.
- Store: category chips, search, sort, result count, clear-filters, sticky filter bar.
- Home: promo banner (active featured promo), promise pills, category cards, featured slider.
- Product page: photo, price, pack size, quantity, flavour select (when the product has flavours), custom fields scoped to the product, trust badges, preparation-time note, related products, sticky Add-to-bag on mobile.

### 3.3 Bag
- Stored in the browser. A line is unique per product + flavour + customisation answers; duplicates are rejected server-side.
- Drawer with quantity edit, remove, subtotal. Quantity per line 1-20.

### 3.4 Custom fields (admin-defined)
- Scope **product** (asked per bag line) or **checkout** (asked once per order).
- Types: text, textarea, number, date, dropdown, radio, checkboxes, checkbox.
- Options: required, placeholder, help text, min/max length (text, textarea), future-only dates, up to 30 options, up to 40 fields.
- Targeting for product fields: all products, categories, or specific products.
- Public endpoint `GET /custom-fields` (active fields only, cached 60 s). The Worker re-validates every answer; it never trusts the browser.
- Seeded fields: **Customisation** (product, textarea, 3-120 chars, required, applies to customisable products) and **Event date** (checkout, date, future-only, optional).
- Answers are shown in the bag, checkout, thank-you page, order detail, invoice, WhatsApp share and admin order list.
- Product answers are stored per item (`items_json[].custom`); checkout answers in `orders.custom_json`.

### 3.5 Checkout
1. Customer must be signed in.
2. Details: name, phone, email, delivery address, PIN code, city, state (Indian state/UT dropdown).
3. PIN lookup fills city and state; the Worker resolves approximate coordinates itself.
4. Delivery method is derived from distance to the shop: **Porter within 30 km**, **courier beyond**.
5. Optional promo code (section 5).
6. Checkout-scope custom fields.
7. Policies acceptance is required.
8. Razorpay payment. The Worker creates the Razorpay order with a shop order number as receipt; after payment the browser sends the signature, the Worker verifies the HMAC signature, fetches the payment and order from Razorpay, checks the amount and status, and only then saves the order in D1.
9. Orders fully covered by a promo skip Razorpay and are saved with payment method `promo`.

The server recalculates prices from the catalogue. Client prices are never trusted.

### 3.6 Order numbers
Customer-facing number `CC-YYMMDD-XXXXX`. The Razorpay order ID is stored separately and shown to admins only.

### 3.7 Thank-you and order detail
- Thank-you page: confirmation, progress tracker, estimated ready date, WhatsApp share (no address or phone in the share text).
- Order detail (`/order/?id=`): items, totals, delivery, progress tracker, invoice download (print to PDF). The admin also sees payment references and can change status here.
- Order statuses: received, confirmed, preparing, ready, out for delivery, delivered, cancelled.

## 4. Accounts

- Sign-in by emailed one-time code (Resend). Codes expire after 10 minutes; resend is rate-limited to once per 60 s.
- Session token: kept for the tab, or in local storage when "remember me" is chosen; server sessions last 30 days.
- Profile: name, phone, email (read-only), default address, PIN, city, state.
- Order history with progress tracker and status pill, link to order detail.

## 5. Promo codes

- Types: **percentage** off all products / a category / a product; **fixed amount** off above a minimum bill.
- Codes are generated by the system. Optional redemption limit and end date; active toggle; optional featured promo shown in banner and store ribbon.
- Limited-use codes are reserved during checkout and counted once per signed-in customer after a successful order; `POST /promos/release` frees an abandoned reservation.
- `POST /promos/quote` previews the discount.

## 6. Admin

Single page at `/admin`, OTP sign-in, five tabs. A summary strip shows New, Open, Unpaid (count and amount) and Paid revenue.

### 6.1 Order book
- Search (order number, customer, phone, email, address, items), status filter, pagination.
- Card: status chip, payment badge (Paid/Unpaid/No payment due), items, custom answers, event date, delivery method, Razorpay references.
- Actions: update status, view details, download invoice.
- For **manual orders** (any payment state): *Edit order* reopens the manual-order form pre-filled (customer, address, delivery, event date, items, quantities, per-line prices). The total is recomputed; if the amount changes on an unpaid order, the old payment link is cancelled and a new one must be generated. Online (Razorpay) orders cannot be edited. API: `POST /admin/orders/update`.
- For **unpaid manual orders**: *Get payment link* (Razorpay Payment Link; reused if already made), Copy, WhatsApp share, and *Mark as paid* (manual fallback).

### 6.2 Customers
Create and edit customers (email is the identity and cannot change), search, pagination.

### 6.3 Create manual order
- Pick customer (prefills address), address, PIN, city, state, delivery method, event date.
- Items: catalogue products (flavour, qty, wrapper note) and **custom items** (name, price, qty).
- Order is created **unpaid** with payment method `manual`.
- **Custom products**: names are typed freely, saved separately in `custom_products` (case-insensitive unique), suggested on later orders, and never shown in the storefront. They have no image or other details. Price is entered per order line.

### 6.4 Promo codes
Create, list, activate/deactivate promos with usage counts.

### 6.5 Custom fields
Create, edit, enable/disable, delete fields (section 3.4).

## 7. Payments

- **Storefront payments**: Razorpay Standard Checkout with server-side signature, payment and amount verification.
- **Admin payment links**: `POST /admin/orders/payment-link` creates a Razorpay Payment Link (amount = order total, `reference_id` = order number, SMS/email notifications off). The link id and URL are stored on the order.
- **Webhook**: `POST /razorpay/webhook`, verified with `RAZORPAY_WEBHOOK_SECRET` (HMAC-SHA256 over the raw body). On `payment_link.paid` with a matching amount, the order becomes `paid`, `payment_id` is recorded and the method becomes `razorpay`. Unknown links and mismatched amounts are ignored.
- **Manual**: `POST /admin/orders/mark-paid`.
- Fees: Razorpay platform fee (2% + 18% GST on the fee for domestic payments).

## 8. Worker API

Every browser call must come from `ALLOWED_ORIGIN`; the webhook is exempt and is signature-verified instead.

| Area | Endpoints |
| --- | --- |
| Public | `GET /promos/featured`, `GET /custom-fields`, `GET /pincode/<pin>` |
| Checkout | `POST /orders`, `POST /verify`, `POST /promos/quote`, `POST /promos/release` |
| Accounts | `POST /auth/request-code`, `/auth/verify-code`, `/auth/orders`, `/auth/profile/update`, `/auth/logout` |
| Admin | `/admin/data`, `/admin/promos/create`, `/admin/promos/update`, `/admin/custom-fields/create`, `/update`, `/delete`, `/admin/customers/create`, `/update`, `/admin/orders/create`, `/update-status`, `/payment-link`, `/mark-paid` |
| Webhook | `POST /razorpay/webhook` |

## 9. Data model (D1)

Migrations `worker/migrations/0001`-`0012`.

| Table | Purpose |
| --- | --- |
| `orders` | One row per order: shop order id, Razorpay ids, payment status/method, order status, customer snapshot, address, items JSON, custom answers JSON, amounts (paise), promo, delivery method/distance, event date, payment link id/URL |
| `customers` | Profile and default address; unique email |
| `customer_login_codes`, `customer_sessions` | Email sign-in |
| `promo_codes`, `promo_redemptions` | Promos and per-customer redemptions |
| `custom_fields`, `pending_order_custom` | Admin-defined fields; answers held while a payment is pending |
| `custom_products` | Admin-only manual-order products |

Amounts are stored in paise to avoid rounding errors.

## 10. Delivery

Distance from the shop (haversine) to the PIN centroid. Up to 30 km: Porter (manual booking); beyond: courier (manual booking). The shop books both manually.

## 11. Non-functional

- **Performance**: static HTML, resized WebP images, Lighthouse accessibility 100 on key pages.
- **SEO**: per-product Open Graph images, Product/Breadcrumb/Organization JSON-LD, sitemap with `lastmod`.
- **Accessibility**: inert closed drawers, contrast, heading order, 16 px mobile inputs.
- **Mobile**: bottom tab bar, sticky add-to-bag, distraction-free checkout, responsive admin.
- **Security**: CORS origin lock, server-side price and answer validation, HMAC verification of payments and webhooks, admin authorisation on every call, secrets kept only as Worker secrets.
- **Privacy**: the privacy policy lists data collected; the Google Maps picker was removed in v1.1.0.

## 12. Deployment and operations

- Releases: every change gets a CHANGELOG entry, a version bump, a `vX.Y.Z` tag and a GitHub release.
- Deploy only on request: (1) `wrangler d1 migrations apply cocoa-kind-orders --remote`, (2) `npm run worker:deploy`, (3) run the Pages workflow. Apply migrations before the Worker.
- Worker secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `AUTH_TOKEN_SECRET`, `RESEND_API_KEY`.
- Tests: `npm test` (Worker unit tests, Node test runner).

## 13. Known gaps and roadmap

| Item | Status |
| --- | --- |
| Move products to D1, admin-managed catalogue | Issue #3, priority 1 |
| Order stages kanban board | Issue #1, priority 2 |
| Corporate orders section | Issue #2, priority 3 |
| Migrate hosting from GitHub Pages to Cloudflare | Low priority (priority-4) |
| Manual orders do not yet support custom fields | Open |
| New products are not auto-added to the Customisation field's targeting | Open |
| Customer account page does not show custom answers | Open |
| Live Razorpay keys and webhook end-to-end test | Pending owner confirmation |
