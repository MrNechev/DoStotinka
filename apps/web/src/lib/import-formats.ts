import { evaluateAmountExpression } from '@dostotinka/shared';
import type { CategoryIndex } from './categories';

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9а-я]+/g, ' ')
    .trim();

/**
 * Default categories of Wallet by BudgetBakers → DoStotinka system keys.
 * `[expenseKey, incomeKey]` – the second one is used for income records.
 */
const WALLET: Record<string, [string, string?]> = {
  'food and drinks': ['food'],
  'bar cafe': ['food.cafe'],
  groceries: ['food.groceries'],
  'restaurant fast food': ['food.restaurants'],
  shopping: ['shopping'],
  'clothes and shoes': ['shopping.clothes'],
  'drug store chemist': ['shopping.drugstore'],
  'electronics accessories': ['shopping.electronics'],
  'free time': ['entertainment.hobbies'],
  'gifts joy': ['gifts.gifts'],
  'health and beauty': ['shopping.cosmetics'],
  'home garden': ['shopping.home_decor'],
  'jewels accessories': ['shopping.jewelry'],
  kids: ['kids'],
  'pets animals': ['pets'],
  'stationery tools': ['shopping.stationery'],
  housing: ['housing'],
  'energy utilities': ['utilities'],
  'maintenance repairs': ['housing.maintenance'],
  mortgage: ['housing.mortgage'],
  'property insurance': ['housing.insurance'],
  rent: ['housing.rent'],
  services: ['housing.services'],
  transportation: ['transport'],
  'business trips': ['transport.business_trips'],
  'long distance': ['transport.train'],
  'public transport': ['transport.public'],
  taxi: ['transport.taxi'],
  vehicle: ['vehicle'],
  fuel: ['vehicle.fuel'],
  leasing: ['vehicle.leasing'],
  parking: ['vehicle.parking'],
  rentals: ['vehicle.rental'],
  'vehicle insurance': ['vehicle.insurance'],
  'vehicle maintenance': ['vehicle.service'],
  'life and entertainment': ['entertainment'],
  'active sport fitness': ['sport'],
  'alcohol tobacco': ['entertainment.tobacco'],
  'books audio subscriptions': ['entertainment.audiobooks'],
  'charity gifts': ['gifts.charity'],
  'culture sport events': ['entertainment.concerts'],
  'education development': ['education'],
  'health care doctor': ['health.doctor'],
  hobbies: ['entertainment.hobbies'],
  'holiday trips hotels': ['travel'],
  'life events': ['gifts.celebrations'],
  'lottery gambling': ['entertainment.lottery', 'other_income.lottery'],
  'tv streaming': ['digital.video_streaming'],
  'wellness beauty': ['personal_care'],
  'communication pc': ['communication'],
  internet: ['communication.internet'],
  'phone cell phone': ['communication.mobile'],
  'postal services': ['communication.postal'],
  'software apps games': ['digital.software'],
  'financial expenses': ['financial'],
  advisory: ['financial.advisory'],
  'charges fees': ['financial.bank_fees'],
  'child support': ['kids.child_support', 'gifts_income.child_support'],
  fines: ['financial.fines'],
  insurances: ['financial.insurance'],
  'loan interests': ['financial.interest'],
  taxes: ['taxes'],
  investments: ['investments'],
  collections: ['investments.collectibles'],
  'financial investments': ['investments.stocks'],
  realty: ['investments.real_estate'],
  savings: ['investments.savings'],
  'vehicles chattels': ['investments'],
  income: ['other_income', 'other_income'],
  'checks coupons': ['refunds.cashback', 'refunds.cashback'],
  'dues and grants': ['benefits.scholarship', 'benefits.scholarship'],
  gifts: ['gifts.gifts', 'gifts_income.gifts'],
  'interests dividends': ['investment_income.dividends', 'investment_income.dividends'],
  'lending renting': ['investment_income.rental', 'investment_income.rental'],
  'refunds tax purchase': ['refunds.purchase', 'refunds.purchase'],
  'rental income': ['investment_income.rental', 'investment_income.rental'],
  sale: ['sales.used_items', 'sales.used_items'],
  'wage invoices': ['salary.salary', 'salary.salary'],
  others: ['other', 'other_income'],
  missing: ['other.missing', 'other_income.misc'],
};

/** Suggests a category id for a category name from another app. */
export function suggestCategory(
  name: string,
  kind: 'expense' | 'income',
  index: CategoryIndex,
): string | null {
  const n = normalize(name);
  if (!n) return null;
  const mapped = WALLET[n];
  if (mapped) {
    const key = kind === 'income' ? (mapped[1] ?? mapped[0]) : mapped[0];
    const hit = index.list.find((c) => c.systemKey === key);
    if (hit) return hit.id;
  }
  // Exact name match, preferring the same kind and subcategories.
  const candidates = index.list.filter((c) => !c.archived && normalize(c.name) === n);
  const best =
    candidates.find((c) => c.kind === kind && c.parentId) ??
    candidates.find((c) => c.kind === kind) ??
    candidates[0];
  if (best) return best.id;
  // Partial match on a word boundary (e.g. "Fuel station" → Fuel).
  const partial = index.list.find(
    (c) => !c.archived && c.kind === kind && c.parentId && n.split(' ').includes(normalize(c.name)),
  );
  return partial?.id ?? null;
}

export type DateFormat = 'auto' | 'ymd' | 'dmy' | 'mdy';

/** Parses common date(-time) formats. Returns null when the value cannot be read. */
export function parseDateValue(raw: string, format: DateFormat): Date | null {
  const v = raw.trim();
  if (!v) return null;
  // ISO 8601 with time zone → exact instant.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m =
    /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp][Mm]))?)?/.exec(
      v,
    );
  if (!m) return null;
  const [, a, b, c, hh = '12', mm = '00', ss = '00', ampm] = m;
  let y: number;
  let mo: number;
  let d: number;
  if (a!.length === 4 || format === 'ymd') {
    [y, mo, d] = [Number(a), Number(b), Number(c)];
  } else {
    const first = Number(a);
    const second = Number(b);
    const useMdy = format === 'mdy' || (format === 'auto' && first <= 12 && second > 12);
    [mo, d] = useMdy ? [first, second] : [second, first];
    y = Number(c);
    if (y < 100) y += 2000;
  }
  let hour = Number(hh);
  if (ampm) {
    const pm = ampm.toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const date = new Date(y, mo - 1, d, hour, Number(mm), Number(ss));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1) return null;
  return date;
}

/** Parses an amount like "-1 234,56 €" into a number (major units). */
export function parseAmountValue(raw: string): number | null {
  // Typographic minus signs and dashes (e.g. "−12.50") count as a minus.
  const normalized = raw.replace(/[\u2012-\u2015\u2212\uFE63\uFF0D]/g, '-');
  const cleaned = normalized.replace(/[^\d.,+-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  // The sign is checked after removing currency codes and symbols ("€-12,50", "EUR -12.50").
  const negative = /^-|-$/.test(cleaned) || /\(.*\d.*\)/.test(normalized);
  const value = evaluateAmountExpression(cleaned.replace(/^[+-]/, '').replace(/-$/, ''));
  if (value === null) return null;
  return negative ? -Math.abs(value) : value;
}

export interface ColumnMapping {
  date: number;
  amount: number;
  account: number;
  currency: number;
  type: number;
  category: number;
  note: number;
  payee: number;
  labels: number;
  transfer: number;
}

export const EMPTY_MAPPING: ColumnMapping = {
  date: -1,
  amount: -1,
  account: -1,
  currency: -1,
  type: -1,
  category: -1,
  note: -1,
  payee: -1,
  labels: -1,
  transfer: -1,
};

const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
  date: ['date', 'datum', 'дата', 'booking date', 'transaction date', 'time'],
  amount: ['amount', 'sum', 'betrag', 'сума', 'value'],
  account: ['account', 'konto', 'сметка'],
  currency: ['currency', 'валута', 'währung'],
  type: ['type', 'вид', 'тип'],
  category: ['category', 'категория', 'kategorie'],
  note: ['note', 'description', 'memo', 'details', 'описание', 'бележка', 'verwendungszweck'],
  payee: ['payee', 'counterparty', 'merchant', 'получател', 'name'],
  labels: ['labels', 'tags', 'label'],
  transfer: ['transfer'],
};

/** Guesses the column mapping from the header row. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping = { ...EMPTY_MAPPING };
  const used = new Set<number>();
  const norm = headers.map((h) => normalize(h));
  for (const field of Object.keys(HEADER_HINTS) as (keyof ColumnMapping)[]) {
    const hints = HEADER_HINTS[field];
    let idx = norm.findIndex((h, i) => !used.has(i) && hints.includes(h));
    if (idx < 0)
      idx = norm.findIndex((h, i) => !used.has(i) && hints.some((hint) => h.startsWith(hint)));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

/** True when the header row looks like an export of Wallet by BudgetBakers. */
export function isWalletExport(headers: string[]): boolean {
  const h = new Set(headers.map((x) => x.trim().toLowerCase()));
  return (
    ['account', 'category', 'currency', 'amount', 'type', 'date'].every((k) => h.has(k)) &&
    (h.has('ref_currency_amount') || h.has('payment_type') || h.has('transfer'))
  );
}

export function typeFromValue(value: string, amount: number): 'expense' | 'income' {
  const v = normalize(value);
  if (/(^| )(income|incomes|credit|приход|доход|einnahme)/.test(v)) return 'income';
  if (/(^| )(expense|expenses|debit|разход|ausgabe)/.test(v)) return 'expense';
  return amount < 0 ? 'expense' : 'income';
}
