// Logos of banks and meal-voucher providers that can be used as account icons.
// They are stored like any other icon name (`brand-…`) and drawn as an image on a white badge.
// To add a brand: put a square-ish SVG into src/assets/brands/ (see the README there) and list it here.
import dsk from '@/assets/brands/dsk.svg';
import edenred from '@/assets/brands/edenred.svg';
import pluxee from '@/assets/brands/pluxee.svg';
import revolut from '@/assets/brands/revolut.svg';
import ubb from '@/assets/brands/ubb.svg';

export type Brand = {
  /** Icon name stored on the account. */
  id: `brand-${string}`;
  name: string;
  src: string;
  kind: 'bank' | 'voucher';
  /** Inner padding as a share of the badge size – wide wordmarks need less to stay legible. */
  padding: number;
};

export const BRANDS: Brand[] = [
  { id: 'brand-dsk', name: 'DSK Bank', src: dsk, kind: 'bank', padding: 0.16 },
  { id: 'brand-ubb', name: 'UBB', src: ubb, kind: 'bank', padding: 0.16 },
  { id: 'brand-revolut', name: 'Revolut', src: revolut, kind: 'bank', padding: 0.22 },
  { id: 'brand-pluxee', name: 'Pluxee', src: pluxee, kind: 'voucher', padding: 0.08 },
  { id: 'brand-edenred', name: 'Edenred', src: edenred, kind: 'voucher', padding: 0.08 },
];

const BY_ID = new Map<string, Brand>(BRANDS.map((b) => [b.id, b]));

export function brandOf(icon: string | null | undefined): Brand | undefined {
  return icon?.startsWith('brand-') ? BY_ID.get(icon) : undefined;
}
