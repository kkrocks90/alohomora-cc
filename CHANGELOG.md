# Changelog

All notable changes to Chocolate Circle are recorded here. The project follows
[Semantic Versioning](https://semver.org/): patch for fixes, minor for new features, major for breaking changes.

For every release: add an entry below, bump `version` in `package.json`, commit, and tag `vX.Y.Z`.

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
