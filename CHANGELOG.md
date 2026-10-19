# Changelog

All notable changes to Chocolate Circle are recorded here. The project follows
[Semantic Versioning](https://semver.org/): patch for fixes, minor for new features, major for breaking changes.

For every release: add an entry below, bump `version` in `package.json`, commit, and tag `vX.Y.Z`.

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
