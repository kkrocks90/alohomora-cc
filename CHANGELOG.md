# Changelog

All notable changes to Chocolate Circle are recorded here. The project follows
[Semantic Versioning](https://semver.org/): patch for fixes, minor for new features, major for breaking changes.

For every release: add an entry below, bump `version` in `package.json`, commit, and tag `vX.Y.Z`.

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
