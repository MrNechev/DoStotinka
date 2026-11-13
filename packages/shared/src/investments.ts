import { z } from 'zod';

/** Investments (holdings in investment accounts) and net worth. */

export const HOLDING_KINDS = ['etf', 'stock', 'fund', 'bond', 'crypto', 'other'] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];

/** Where the price comes from: typed in, Yahoo Finance (stocks, ETFs) or CoinGecko (crypto). */
export const PRICE_SOURCES = ['manual', 'yahoo', 'coingecko'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export interface Holding {
  id: string;
  accountId: string;
  name: string;
  /** Ticker (Yahoo, e.g. VWCE.DE) or coin id (CoinGecko, e.g. bitcoin). */
  symbol: string | null;
  kind: HoldingKind;
  quantity: number;
  /** Price of one unit in `currency` (major units, e.g. 104.32). */
  price: number;
  currency: string;
  /** What was paid for the whole position, minor units of `currency`. */
  costBasis: number;
  priceSource: PriceSource;
  priceUpdatedAt: string | null;
  /** quantity × price, minor units of `currency`. */
  value: number;
  /** value − costBasis. */
  gain: number;
  createdAt: string;
}

const symbol = z
  .string()
  .trim()
  .max(40)
  .regex(/^[A-Za-z0-9.\-_=^:]*$/, 'Use the ticker as shown by the price source')
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const holdingInput = z
  .object({
    accountId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    symbol,
    kind: z.enum(HOLDING_KINDS).default('etf'),
    quantity: z.number().positive().max(1e12),
    price: z.number().min(0).max(1e12),
    currency: z.string().length(3).toUpperCase(),
    costBasis: z.number().int().min(0).max(1e15),
    priceSource: z.enum(PRICE_SOURCES).default('manual'),
  })
  .refine((h) => h.priceSource === 'manual' || !!h.symbol, {
    message: 'Enter the ticker for automatic prices',
    path: ['symbol'],
  });
export type HoldingInput = z.input<typeof holdingInput>;

export const quoteQuery = z.object({
  source: z.enum(['yahoo', 'coingecko']),
  symbol: z.string().trim().min(1).max(40),
  /** For CoinGecko: the currency to price in. */
  currency: z.string().length(3).default('EUR'),
});

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  name: string | null;
  /** What it is, when the source says so. */
  kind: HoldingKind | null;
}

export interface NetWorthGroup {
  /** Account type, or `lent` / `borrowed` for open debts. */
  key: string;
  amount: number;
}

export interface NetWorth {
  currency: string;
  total: number;
  /** Positive parts (what you have) and negative parts (what you owe). */
  assets: number;
  liabilities: number;
  /** Unrealised gain of all holdings. */
  investmentGain: number;
  groups: NetWorthGroup[];
  /** Month ends (and today): accounts plus investment gains (without debts). */
  history: { date: string; value: number }[];
}

/** Value of `quantity` units at `price` in minor units of a currency with `decimals`. */
export function holdingValue(quantity: number, price: number, decimals: number): number {
  return Math.round(quantity * price * 10 ** decimals);
}
