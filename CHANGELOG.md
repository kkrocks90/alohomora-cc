# Changelog

All notable changes to Chocolate Circle are recorded here. The project follows
[Semantic Versioning](https://semver.org/): patch for fixes, minor for new features, major for breaking changes.

For every release: add an entry below, bump `version` in `package.json`, commit, and tag `vX.Y.Z`.

## 1.41.0

- New flat discount: a sitewide, percentage-only discount set in the admin Promos tab (name, percentage, optional end date, on/off). Applied automatically at checkout, enforced by the Worker, and shown on the order.
- While a flat discount is live, promo codes are blocked and the checkout code box is hidden.
- The home page now advertises only the flat discount. Coupon codes are no longer shown on the home or shop pages.
- Migration 0018 adds `flat_discount`. Apply it before deploying the Worker.

## 1.40.2

- Home: "Good to know" icons are now round badges on mobile and tablet instead of a full-width bar.

## 1.40.1

- Home: removed the "A celebration coming up?" strip; the event-date tip is now a fourth card in "Good to know".

## 1.40.0

- Every seasonal theme has a matching category (e.g. "Diwali Special"). The theme banner and hero button now open the shop filtered to it, and its chip always shows while that theme is live.
- Migration 0017 seeds the eight seasonal categories (hidden by default) so products can be assigned to them in the admin.

## 1.39.1

- Admin: success and error messages now appear as a popup toast (auto-dismiss, closable) instead of a line at the top.
- Admin: nicer category text field (stacked label, rounded input, focus ring).

## 1.39.0

- Admin: new Categories manager (Products tab) to add, rename, hide/show and delete categories.
- Renaming cascades to products, promo codes and custom fields; delete is blocked while a category is in use.
- Hidden categories are removed from shop filters and home category cards.
- Migration 0016 adds `catalogue_categories.hidden` and backfills product categories. Apply it before deploying the Worker.

## 1.38.2

- Docs: README rewritten and the functional specification brought up to date (themes, discount on manual orders, Worker deploy workflow, catalogue, status and roadmap).

## 1.38.1

- Header garland now follows the theme: Christmas red and green bulbs, tricolour dots for Republic and Independence Day, raindrops for Monsoon, confetti for Birthday, hearts for Valentine's Day and grain and turmeric for Pongal.

## 1.38.0

- New themes: monsoon, christmas, republic-day, pongal, birthday, independence-day and valentines-day. Each has its own palette, ribbon banner and hero banner. Pick one from the theme dropdown when running the Pages deploy workflow.

## 1.37.0

- Shop page search, sort and category chips restyled on desktop and mobile: soft shadows, focus ring, custom sort arrow, roomier chips. Diwali theme adds gold borders and a maroon/gold active chip.

## 1.36.1

- Diwali theme: the footer logo text was dark on the maroon footer; it is now cream and gold.

## 1.36.0

- Admin manual orders can now have a discount (INR amount). It reduces the order total, shows in the invoice, order details, customer account and order emails, and is included when editing an order.
- Diwali theme: more space between the garland and the promo banner on mobile.

## 1.35.1

- Diwali theme: added a small gap so the garland no longer overlaps the promo banner on mobile.

## 1.35.0

- The Pages deploy workflow now has a theme selector (repo-setting, default, diwali) when run manually.

## 1.34.0

- Themes can now swap the home hero image (`heroImage` in `src/config/theme.ts`). Diwali uses a new illustration with a lit diya, marigold and a warm saffron background; the base theme keeps the original.

## 1.33.0

- Added a Diwali hero banner (maroon and gold panel with swaying lanterns, diya and a "Shop Diwali gifts" button) on the home page. It is part of the theme config (`heroBanner` in `src/config/theme.ts`), so it disappears when the theme is switched to `default`.

## 1.32.0

- Added a theme system and a Diwali theme (maroon and gold palette, ribbon banner, marigold garland under the header, twinkling hero lights) for desktop and mobile. Switch with the GitHub variable SITE_THEME (`default` restores the base look). Admin pages are unchanged.

## 1.31.2

- Footer logo is now white so it is visible on the dark footer.

## 1.31.1

- Home page "our story" section now shows the new brand logo instead of the ringed "C".

## 1.31.0

- New brand logo (C in a circle with a cocoa pod) replaces the plain "c" mark in the site header, footer and admin header, plus the favicon, Apple touch icon and structured-data logo.

## 1.30.2

- Buttons are now pill-shaped on mobile too, matching desktop.

## 1.30.1

- Mobile polish for the redesigned admin forms (add product, order, customer, promo, custom field): tighter cards, 16px tap-friendly inputs, stacked order lines, sticky full-width action bar.

## 1.30.0

- Corporate enquiry form now emails the shop directly (subject: "Corporate enquiry: <company> - <quantity> (<occasion>)", reply-to set to the enquirer). WhatsApp remains as a second button. Includes a spam honeypot.

## 1.29.0

- Corporate page client logos are now an endless auto-scrolling slider: drag with the mouse, swipe on mobile, use the arrows or keyboard to move faster. Pauses on hover/touch; respects reduced motion.

## 1.28.0

- New orders now send an email to the shop (ADMIN_EMAIL) and a confirmation email to the customer via Resend. Covers online checkout, promo-covered free orders and admin manual orders. Email failures never block an order.

## 1.27.1

- Polished the Corporate orders page on mobile: full-width buttons, compact cards, 2-column logos, stacked steps, full-bleed enquiry form with larger inputs.

## 1.27.0

- Added a Corporate orders page (/corporate) with offerings, client logos (served directly and through event management partners), and a requirements form that sends a prefilled WhatsApp message or email. Linked from the header, menu and footer.

## 1.26.1

- Admin: the Create manual order, Customer details, Promo code and Custom field forms now use the same sectioned card design as the product form (grouped sections, consistent inputs, dark total bar, cleaner item rows).

## 1.26.0

- Manual orders can now be recorded as Unpaid, Partially paid (with the amount received) or Paid in full, when creating or editing.
- Order cards show the received amount and balance due; the Unpaid stat counts balances; payment links are issued for the balance only.
- New migration 0015 adds `amount_received_paise` to orders.

## 1.25.2

- Fixed the admin dashboard hanging on "Opening dashboard..." (leftover add-photo handler removed in the product form redesign).

## 1.25.1

- Admin order cards: items are now a tidy list (name and extras on the left, quantity on the right) directly under the delivery details, with the status controls pinned to the bottom so side-by-side cards line up.
- Admin Products: redesigned add/edit form with Photos, Details and Options sections, three photo slots with a "Main" badge, a rupee price field and toggle rows.

## 1.25.0

- Up to 3 photos per product. The product page has a swipeable gallery with arrows and dots; shop, home and related cards show the main photo only.
- New admin Products tab: add and edit products, hide or show them, and upload photos (resized in the browser, stored in Cloudflare R2).
- Existing product photos are copied to R2 (migration 0014).
- The storefront build now pulls the live catalogue from the Worker. Saving a product can trigger a site rebuild once the `GITHUB_DISPATCH_TOKEN` Worker secret is set.

## 1.24.0

- Products phase 1: catalogue now lives in D1 (migration 0013 seeds all 48 products and categories). The Worker reads prices, flavours and categories from D1 (30 s cache) for checkout, promos, custom fields and admin, falling back to the bundled JSON if the table is empty.
- New public `GET /products` endpoint. The storefront still builds from products.json until the next phases.

## 1.23.0

- Admin sessions now persist across browser restarts (until sign out or expiry).
- Signing in as admin from the customer sign-in page, or opening My profile with an active admin session, goes straight to the admin dashboard.

## 1.22.0

- Admin: edit manual orders (customer, address, delivery, event date, items, quantities, prices). Catalogue items now have an editable price per order.
- Changing the amount of an unpaid order cancels its old payment link.

## 1.21.5

- Manual orders: maximum quantity per item raised to 5000.

## 1.21.4

- Admin order cards: status and payment labels now share one uniform size; fixed stretched payment badge.

## 1.21.3

- Manual orders: maximum quantity per item raised to 3000.

## 1.21.2

- Admin order cards: smaller, aligned action buttons.
- Manual orders: quantity is now a number box instead of a dropdown.

## [1.21.1]

### Changed
- Admin redesign: summary tiles (new, open, unpaid, paid revenue), colour-coded status and payment chips, two-column order/customer/promo cards on desktop, sticky tabs and header, larger touch targets and tidier action buttons on mobile.

## [1.21.0]

### Added
- Admin: "Get payment link" on unpaid manual orders creates a Razorpay payment link with Copy and WhatsApp buttons. Paid links mark the order paid automatically through a signed webhook (`POST /razorpay/webhook`, needs the `RAZORPAY_WEBHOOK_SECRET` Worker secret). A "Mark as paid" button is the manual fallback. Requires migration `0012`.

### Changed
- Custom products in manual orders now use a separate "+ Custom item" row (name with saved-name suggestions, price, quantity) instead of being mixed into the product dropdown.

## [1.20.0]

### Added
- Admin manual orders can include custom products: pick "+ New custom product...", type a name and price. Names are saved separately (migration `0011`) and reappear under "My custom products" for later orders. They never appear in the store.

## [1.19.2]

### Fixed
- Custom fields (e.g. Customisation) now span the full width of the product options and checkout forms on mobile instead of sitting in a half-width column.

## [1.19.1]

### Fixed
- Admin dashboard login now accepts legacy order payloads that do not include custom-field snapshots, so OTP sign-in no longer fails with "invalid admin data" on older/test orders.
- Missing item/order custom snapshots are normalized to empty lists on the client, preventing runtime errors while keeping invoice and order views working.

## [1.19.0]

### Changed
- The checkout "Event date" and the product-page wrapper "Customisation" inputs are now admin-managed custom fields (seeded by migration `0010`), so they can be edited, reordered, retargeted or disabled from the admin Custom fields tab.
- Custom text fields support minimum and maximum length; date fields can be limited to today or later.
- Wrapper text is no longer required by the Worker. Existing orders keep their stored event date and wrapper text.

## [1.18.0]

### Added
- Admin "Custom fields" tab: create, edit, enable/disable and delete fields at product-detail or checkout level (text, textarea, number, date, dropdown, radio, checkboxes, checkbox), with required flag, placeholder, help text and targeting by all products, categories or specific products.
- Answers are validated server-side and shown in the cart, checkout, thank-you page, order detail, invoice, WhatsApp share and admin orders.
- Migration `0009_custom_fields.sql` (apply before deploying the Worker).

## [1.17.0] - 2026-10-20

### Added
- New product: Chocolate Frogs (Set of 6), Rs 1500, listed under both Kids B'Day Special and Elite Gifting. Chocolate flavour only, no wrapper customisation.
- Products can now appear in more than one category via an optional `extraTags` field; the store filter and category promo codes respect it.

## [1.16.3] - 2026-10-20

### Added
- New product: Chocolate Bouquet (Pack of 1), Rs 850, in Elite Gifting. All flavours, wrapper customisation available.

## [1.16.2] - 2026-10-20

### Added
- New product: Heart Chocolate Box (Pack of 1), Rs 900, in Elite Gifting. Chocolate or Nuts flavour, no wrapper customisation.

## [1.16.1] - 2026-10-20

### Added
- New product: Heart Chocolates (Pack of 50), Rs 500, in Chocolate treats. All flavours available, no wrapper customisation.

## [1.16.0] - 2026-10-20

### Added
- New product: Assorted Heart Chocolates (Pack of 1), Rs 1350, in Elite Gifting. No flavour choice.
- Products can be marked `customizable: false`: no wrapper description is asked for on the product page, cart or checkout, and the Worker accepts an empty wrapper for them.

## [1.15.1] - 2026-10-20

### Fixed
- Downloaded or printed invoices were blank because the invoice container stayed hidden; it is now shown while printing.

## [1.15.0] - 2026-10-20

### Added
- Order detail page (/order/?id=...) for customers and the admin: items, totals, delivery details, progress tracker, and a Download invoice button (use Save as PDF in the print window).
- Admin can update an order's status from the detail page, which also shows payment references.
- "View details" links from the profile order cards, the admin order list and the thank-you page.
- The thank-you page's WhatsApp share now includes the order ID, items, total, event date and delivery method (no address or phone).

### Changed
- The admin invoice now uses the shared invoice renderer.

## [1.14.4] - 2026-10-20

### Changed
- Moved both Lollipops to Chocolate treats and removed the Candies & sweets category.

## [1.14.3] - 2026-10-20

### Changed
- Categories: renamed "Gifts & hampers" to "Hampers", removed "Tradition Specials", added "Bulk Specials".
- Products: removed Dry Grapes (In a bottle); moved Stationary Chocolate, Cone options, Choco Dabba, Choco Cards, Folded Card Chocolate and both Mini Cards to Kids B'Day Special; Bangle Chocolate to Hampers; Stick Candy Junior, Stick Candy and Peanut Candy to Chocolate treats.
- Promo-code category lists come from the same data, so the Worker needs a redeploy to pick up the new category names.

## [1.14.2] - 2026-10-20

### Fixed
- The profile and admin pages no longer flash the sign-in form while a saved session loads; a spinner is shown instead.

## [1.14.1] - 2026-10-20

### Fixed
- Product names in the product page's "You may also like" row were oversized because the section-heading style leaked onto the card titles.

## [1.14.0] - 2026-10-21

### Added
- Per-product Open Graph share images (1200x630), `og:type=product`, and richer descriptions with price and pack size.
- Product, BreadcrumbList and Store/Organization JSON-LD structured data.
- `lastmod` in the sitemap.

### Fixed
- Accessibility (Lighthouse 100 on key pages): cart drawer and mobile menu are `inert` when closed, product card heading order, redundant labels, colour contrast, and select spacing.

## [1.13.0] - 2026-10-20

### Added
- Product page: sticky image on desktop, trust badges, preparation-time note and a "You may also like" row.
- Checkout: step indicator, rounded fields, and an assurance list (secure payment, lead time, WhatsApp help).
- Thank-you page: confirmation badge, order progress tracker, estimated ready date and a WhatsApp share button.
- Account: order history cards now show a progress tracker and a status pill.
- Policy pages: an automatic "On this page" contents list.
- Branded 404 page.
- Store: the search and category bar now stays pinned on desktop too.
- Admin: mobile-friendly scrolling tabs and stacked filters.

## [1.12.0] - 2026-10-20

### Changed
- Desktop header: animated underline on nav links, pill-style Login, and a filled cocoa "My bag" button with a soft shadow.
- Mobile side menu: rounded panel, icon-badged links, and a footer with tagline plus WhatsApp and Instagram buttons.

## [1.11.0] - 2026-10-20

### Changed
- Porter delivery radius increased from 15 km to 30 km. Beyond 30 km, courier is suggested. Terms, shipping and privacy policies updated.

## [1.10.1] - 2026-10-20

### Changed
- Mobile footer redesign: dark cocoa rounded panel, centred brand and tagline, pill "Shop all treats" link, side-by-side Instagram and WhatsApp buttons, and a two-column policy link list.

## [1.10.0] - 2026-10-20

### Changed
- Desktop visual polish: larger hero with soft glow and shadowed artwork, pill buttons, dark promise bar, rounded category cards, bordered product cards with hover lift, icon-badged "Good to know" cards, and a rounded closing banner.

## [1.9.3] - 2026-10-20

### Changed
- Product cards (home featured slider and store) now align their price and "Choose options" button across a row.
- Redesigned the "Choose options" button as a filled cocoa pill with an arrow chip.

## [1.9.2] - 2026-10-20

### Changed
- Smaller featured product cards on the mobile home page (square photo, compact text, no description).

## [1.9.1] - 2026-10-20

### Fixed
- Removed the small sideways scroll on mobile pages, caused by the off-canvas cart drawer extending past the screen.

## [1.9.0] - 2026-10-20

### Changed
- Mobile home page redesign: photo-first hero with a full-width pill button, swipeable promise pills, category cards and "Good to know" cards, tighter section spacing, and rounded story and closing cards.

## [1.8.0] - 2026-10-20

### Added
- New categories (no products yet): Kids B'Day Special, Tradition Specials, Elite Gifting. They appear as store filters and promo targets; they show on the home page once they have products. List lives in `src/data/categories.json`.

## [1.7.1] - 2026-10-20

### Removed
- Jujubes (In a bottle) and Colorful Candy (In a bottle) products.

## [1.7.0] - 2026-10-20

### Changed
- Orders now get a shop-generated order number (`CC-YYMMDD-XXXXX`) shown to customers, on the thank-you page, in the account page and on invoices.
- The Razorpay order ID is stored separately (`razorpay_order_id`) and shown only to admins, alongside the payment ID.
- Existing Razorpay-ID orders are remapped to new order numbers by migration `0008`.

## [1.6.0] - 2026-10-20

### Changed
- State is now a dropdown of all Indian states and union territories on checkout, profile and admin forms. PIN code lookup selects the matching state automatically, and older saved free-text states are matched where possible.

## [1.5.0] - 2026-10-20

### Changed
- Mobile profile page: sign-in form in a rounded card with a pill button, personal details as a clean card list, rounded order and address cards with a "Paid" pill, larger touch targets.

## [1.4.0] - 2026-10-20

### Changed
- Mobile product page: edge-to-edge square photo, larger price with a pack-size pill, quantity and flavour side by side, rounded 16px fields (no iOS zoom), pill-shaped Add to bag button.
- Mobile checkout: distraction-free (tab bar and WhatsApp button hidden), compact heading, City and State side by side, larger rounded fields, and a floating "Continue to secure payment" button.

## [1.3.0] - 2026-10-20

### Added
- Store: category chips (horizontally scrollable) replace the filter dropdown; rounded search with a clear button; compact sort dropdown.
- Store: sticky search/filter bar on mobile, "Showing X of Y treats" count, and a "Clear search & filters" button on the empty state.
- Hover polish on product cards (desktop).

### Changed
- Compact store heading on mobile so products appear sooner.

## [1.2.1] - 2026-10-20

### Changed
- Promo banner "Use code" is now a button that copies the code and shows a brief "Code copied" popup instead of redirecting to the store page.

## [1.2.0] - 2026-10-20

### Added
- Mobile bottom tab bar (Home, Shop, Bag with item count, Account) with safe-area support.
- Sticky "Add to bag" button on mobile product pages.

### Changed
- Mobile product cards: stacked price and full-width, larger "Choose options" button; 2-line description clamp; consistent card heights.
- WhatsApp button moved above the tab bar; form fields use 16px text to prevent iOS zoom.

## [1.1.0] - 2026-10-19

### Changed
- Delivery address now uses the PIN code only. Entering a PIN code fills the city and state automatically; the Google Maps address picker and its API key are removed.
- The Worker looks up each PIN code's approximate location itself to keep the 15 km Porter / courier rule, so the browser no longer sends coordinates.

### Added
- `GET /pincode/<pin>` lookup endpoint (India Post PIN data and OpenStreetMap Nominatim, cached for 30 days).

### Removed
- Google Maps address picker, `PUBLIC_GOOGLE_MAPS_API_KEY` and the map disclosure in the privacy policy.

## [1.0.1] - 2026-10-19

### Fixed
- Admin sign-in: the **Send OTP** button did nothing because the admin page script failed on load while setting up the new address map fields.

## [1.0.0] - 2026-10-19

Initial release.

### Added
- Static Astro storefront with product catalogue, product options and flavours, and cart.
- Checkout with Razorpay payments, customer accounts and sign-in.
- Delivery address with PIN code, city, state and a Google Maps address picker, used consistently in checkout, account and admin.
- Distance-based delivery estimate (Porter up to 15 km, courier beyond).
- Admin area for orders, customers and promo codes.
- Promo codes (percentage off products, categories or all; flat amount off above a minimum bill) with a checkout field.
- Home page promo banner and store ribbon showing an active promo.
- Auto-scrolling, repeating featured-products slider on mobile.
- WhatsApp contact button, privacy policy, and GitHub Pages deployment through GitHub Actions.
