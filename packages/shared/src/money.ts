import { currencyDecimals } from './currencies';

/** Converts a major-unit number (e.g. 12.34) to integer minor units (1234). */
export function toMinor(major: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency);
  return Math.round(major * factor);
}

/** Converts integer minor units (1234) to a major-unit number (12.34). */
export function toMajor(minor: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency);
  return minor / factor;
}

/**
 * Evaluates a tiny arithmetic expression (+, -, *, /, parentheses) so that users can type
 * things like `12.5+3` into amount fields. Returns `null` for invalid input.
 */
export function evaluateAmountExpression(input: string): number | null {
  const normalized = normalizeNumberString(input);
  if (normalized === null) return null;
  if (!/^[\d.+\-*/() ]+$/.test(normalized)) return null;

  let pos = 0;
  const src = normalized.replace(/\s+/g, '');

  const peek = () => src[pos];
  const parseNumber = (): number | null => {
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos]!)) pos++;
    const token = src.slice(start, pos);
    if (!token || (token.match(/\./g)?.length ?? 0) > 1) return null;
    const n = Number(token);
    return Number.isFinite(n) ? n : null;
  };
  const parseFactor = (): number | null => {
    const ch = peek();
    if (ch === '-') {
      pos++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (ch === '+') {
      pos++;
      return parseFactor();
    }
    if (ch === '(') {
      pos++;
      const v = parseExpr();
      if (peek() !== ')') return null;
      pos++;
      return v;
    }
    return parseNumber();
  };
  const parseTerm = (): number | null => {
    let left = parseFactor();
    while (left !== null && (peek() === '*' || peek() === '/')) {
      const op = src[pos++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const parseExpr = (): number | null => {
    let left = parseTerm();
    while (left !== null && (peek() === '+' || peek() === '-')) {
      const op = src[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const result = parseExpr();
  if (result === null || pos !== src.length || !Number.isFinite(result)) return null;
  return result;
}

/**
 * Normalizes a user-typed number that may use either `,` or `.` as decimal separator and
 * may contain thousands separators. `1.234,56` → `1234.56`, `1,234.56` → `1234.56`,
 * `12,5` → `12.5`.
 */
function normalizeNumberString(input: string): string | null {
  let s = input.trim().replace(/[\s  ']/g, '');
  if (!s) return null;
  // Handle each number token independently so expressions keep working.
  s = s.replace(/[\d.,]+/g, (token) => {
    const lastComma = token.lastIndexOf(',');
    const lastDot = token.lastIndexOf('.');
    if (lastComma === -1) {
      return token;
    }
    if (lastDot === -1) {
      // Only commas. Treat a single comma followed by 1-3 digits... ambiguous; when there
      // is exactly one comma we treat it as decimal separator (European style), otherwise
      // commas are thousands separators.
      const commas = token.split(',').length - 1;
      return commas === 1 ? token.replace(',', '.') : token.replace(/,/g, '');
    }
    if (lastComma > lastDot) {
      return token.replace(/\./g, '').replace(',', '.');
    }
    return token.replace(/,/g, '');
  });
  return s;
}

/** Parses a user-typed amount (supports arithmetic) to minor units. Returns null if invalid. */
export function parseAmountToMinor(input: string, currency: string): number | null {
  const value = evaluateAmountExpression(input);
  if (value === null) return null;
  return toMinor(value, currency);
}

/** Formats minor units with the currency symbol according to the given locale. */
export function formatMoney(
  minor: number,
  currency: string,
  options: {
    locale?: string;
    signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never';
    compact?: boolean;
  } = {},
): string {
  const decimals = currencyDecimals(currency);
  const value = minor / 10 ** decimals;
  try {
    return new Intl.NumberFormat(options.locale, {
      style: 'currency',
      currency,
      signDisplay: options.signDisplay ?? 'auto',
      notation: options.compact ? 'compact' : 'standard',
      minimumFractionDigits: options.compact ? 0 : decimals,
      maximumFractionDigits: options.compact ? 1 : decimals,
    }).format(value);
  } catch {
    // Unknown currency code for Intl (e.g. BTC on some runtimes)
    const num = new Intl.NumberFormat(options.locale, {
      minimumFractionDigits: options.compact ? 0 : Math.min(decimals, 8),
      maximumFractionDigits: Math.min(decimals, 8),
      signDisplay: options.signDisplay ?? 'auto',
    }).format(value);
    return `${num} ${currency}`;
  }
}

/** Formats minor units as a plain number string suitable for an input field (`12.34`). */
export function minorToInputString(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  return (minor / 10 ** decimals).toFixed(decimals);
}

export type RateMap = Readonly<Record<string, number>>;

/**
 * Converts an amount in minor units from one currency to another.
 * `rates` maps currency code → value of 1 unit of that currency expressed in the base
 * currency. The base currency itself must have rate 1 (or be absent).
 */
export function convertMinor(minor: number, from: string, to: string, rates: RateMap): number {
  if (from === to) return minor;
  const fromRate = rates[from];
  const toRate = rates[to] ?? 1;
  if (fromRate === undefined || fromRate <= 0 || toRate <= 0) return 0;
  const major = toMajor(minor, from);
  const inBase = major * fromRate;
  return toMinor(inBase / toRate, to);
}
