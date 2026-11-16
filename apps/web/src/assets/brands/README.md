# Logos of banks, shops and services

These logos let you recognise an account or a payee at a glance. They are trademarks of their
owners and are used only to identify the corresponding bank, shop or service. DoStotinka is not
affiliated with any of them.

The brands themselves (name, website, other spellings, usual category) are listed in
[`packages/shared/src/brands.ts`](../../../../../packages/shared/src/brands.ts): every Bulgarian
bank, the largest banks of the European countries, payment services, meal vouchers and the shops
and services found in Bulgarian malls and bills.

## Where the files come from

[`logos.json`](logos.json) records the source of every file and how it is drawn (`cover`: a square
app icon that fills the circle; `contain`: a logo inside the white circle).

- **The brand's own website** – its app icon (`apple-touch-icon` / web app manifest icon), scaled to
  96 × 96 px WebP. Most logos come from here.
- **[Simple Icons](https://simpleicons.org)** (CC0) – the brand glyph in its colour, as SVG, when
  the website only offers a small favicon.
- **[Wikimedia Commons](https://commons.wikimedia.org)** – the logo file named in
  [`scripts/brand-logo-sources.json`](../../../../../scripts/brand-logo-sources.json) or found by
  the script, as a PNG rendered by Wikimedia.
- The hand-made SVGs of DSK Bank, UBB, Revolut, Pluxee and Edenred (Wikimedia Commons, cropped to
  the symbol where the brand has one).

Brands without a usable logo (only a thin wordmark, or no reachable website) are still recognised
as payees; they show their category icon.

## Adding a brand

1. Add it to `packages/shared/src/brands.ts` (id: lowercase letters, digits and dashes).
2. Run `python3 scripts/brand-logos.py <id>` (needs Pillow). It downloads the logo and updates
   `logos.json`. Downloaded files are treated as untrusted: only raster images are decoded and SVG
   from websites is never rasterised.
3. Look at the result in the app. If it is wrong, name a Wikimedia Commons file or another brand's
   logo in `scripts/brand-logo-sources.json` and run the script again with `--force <id>`.
