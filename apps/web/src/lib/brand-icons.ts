// Logos of banks, payment services, meal vouchers and shops (packages/shared/src/brands.ts).
// Accounts store a bank logo as the icon `brand-<id>`; payees are recognised by name. The image
// files (src/assets/brands, see the README there) are only downloaded when they are shown.
import {
  BRAND_LIST,
  type BrandInfo,
  type BrandKind,
  brandById,
  recognizeBrand,
  searchBrands,
} from '@dostotinka/shared';
import logos from '@/assets/brands/logos.json';

type LogoMeta = { file?: string; style?: string; padding?: number };

const FILES = import.meta.glob('../assets/brands/*.{webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type Brand = {
  /** Icon name stored on accounts. */
  id: `brand-${string}`;
  key: string;
  name: string;
  kind: BrandKind;
  country: string | null;
  src: string;
  /** The logo fills the circle (square app icons) instead of sitting inside it. */
  cover: boolean;
  /** Inner padding as a share of the badge size (logos that sit inside the circle). */
  padding: number;
  category?: string;
};

function toBrand(info: BrandInfo): Brand | undefined {
  const meta = (logos as Record<string, LogoMeta>)[info.id];
  if (!meta) return undefined;
  const src = FILES[`../assets/brands/${meta.file ?? `${info.id}.webp`}`];
  if (!src) return undefined;
  const cover = meta.style === 'cover';
  return {
    id: `brand-${info.id}`,
    key: info.id,
    name: info.name,
    kind: info.kind,
    country: info.country,
    src,
    cover,
    padding: cover ? 0 : (meta.padding ?? 0.1),
    category: info.category,
  };
}

/** All brands with a logo, in the order of the registry. */
export const BRANDS: Brand[] = BRAND_LIST.map(toBrand).filter((b): b is Brand => !!b);

const BY_ID = new Map<string, Brand>(BRANDS.map((b) => [b.id, b]));

/** The brand of an account icon (`brand-…`). */
export function brandOf(icon: string | null | undefined): Brand | undefined {
  return icon?.startsWith('brand-') ? BY_ID.get(icon) : undefined;
}

const payeeCache = new Map<string, Brand | null>();

/** The logo of a payee such as "Lidl", "LIDL BULGARIA EOOD 123" or "Кауфланд". */
export function payeeBrand(payee: string | null | undefined): Brand | undefined {
  const text = payee?.trim();
  if (!text) return undefined;
  let hit = payeeCache.get(text);
  if (hit === undefined) {
    const info = recognizeBrand(text);
    hit = (info && BY_ID.get(`brand-${info.id}`)) ?? null;
    if (payeeCache.size > 2000) payeeCache.clear();
    payeeCache.set(text, hit);
  }
  return hit ?? undefined;
}

/** Brands (shops first) for what was typed in the payee field. */
export function suggestBrands(typed: string, limit = 5): (Brand | BrandInfo)[] {
  return searchBrands(typed, limit * 2)
    .map((info) => BY_ID.get(`brand-${info.id}`) ?? info)
    .slice(0, limit);
}

export { brandById };

/** Country names for the bank picker. */
export const COUNTRY_NAMES: Record<string, string> = {
  BG: 'Bulgaria',
  AT: 'Austria',
  BE: 'Belgium',
  HR: 'Croatia',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DK: 'Denmark',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  GR: 'Greece',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
  SE: 'Sweden',
  GB: 'United Kingdom',
  CH: 'Switzerland',
  NO: 'Norway',
  RS: 'Serbia',
  MK: 'North Macedonia',
  TR: 'Turkey',
  UA: 'Ukraine',
  IS: 'Iceland',
};

/**
 * The logo for a record: from its payee, or from a short note (older records often have the shop
 * in the note: "Kaufland").
 */
export function recordBrand(
  payee: string | null | undefined,
  note?: string | null,
): Brand | undefined {
  const fromPayee = payeeBrand(payee);
  if (fromPayee || payee?.trim()) return fromPayee;
  const text = note?.trim();
  return text && text.split(/\s+/).length <= 4 ? payeeBrand(text) : undefined;
}
