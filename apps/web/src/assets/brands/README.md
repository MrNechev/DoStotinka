# Bank and voucher logos

These logos let you recognise an account at a glance. They are trademarks of their owners and are
used only to identify the corresponding accounts. DoStotinka is not affiliated with any of them.

| File | Brand | Source (Wikimedia Commons) | Changes |
| --- | --- | --- | --- |
| `dsk.svg` | DSK Bank | [File:DSK Bank logo.svg](https://commons.wikimedia.org/wiki/File:DSK_Bank_logo.svg) | cropped to the symbol |
| `ubb.svg` | UBB (ОББ) | [File:ОББ logo.svg](https://commons.wikimedia.org/wiki/File:%D0%9E%D0%91%D0%91_logo.svg) | colours inlined |
| `revolut.svg` | Revolut | [File:Revolut logo.svg](https://commons.wikimedia.org/wiki/File:Revolut_logo.svg) | cropped to the “R” |
| `pluxee.svg` | Pluxee | [File:Pluxee Logo 2023.svg](https://commons.wikimedia.org/wiki/File:Pluxee_Logo_2023.svg) | – |
| `edenred.svg` | Edenred | [File:Edenred.svg](https://commons.wikimedia.org/wiki/File:Edenred.svg) | – |

Editor metadata was removed from all files.

## Adding a bank

1. Add a small SVG whose `viewBox` is roughly square (crop wide wordmarks to the symbol where the
   brand has one). It is shown on a white circle, so dark or coloured artwork works best.
2. Register it in `src/lib/brand-icons.ts` with an id `brand-<name>` (lowercase letters, digits and
   dashes only).
3. Add a row to the table above.
