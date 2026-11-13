// Turning payment notifications (bank apps, Google Wallet, SMS, Apple Pay shortcuts) and bank
// transaction texts into structured data. Pure functions – shared by the server and its tests.
import { CURRENCIES } from './currencies';

export interface ParsedNotification {
  type: 'expense' | 'income';
  /** Decimal amount with a dot as separator and no thousands separators, e.g. "1234.50". */
  amount: string;
  /** ISO currency code, null when the text names none (the account currency is used then). */
  currency: string | null;
  payee: string | null;
}

/** Display names of well-known apps (Android package names). */
export const KNOWN_APPS: Record<string, string> = {
  'com.revolut.revolut': 'Revolut',
  'com.google.android.apps.walletnfcrel': 'Google Wallet',
  'com.google.android.apps.messaging': 'SMS',
  'com.samsung.android.messaging': 'SMS',
  'com.android.mms': 'SMS',
  'com.viber.voip': 'Viber',
};

export function appLabel(app: string): string {
  return KNOWN_APPS[app] ?? app;
}

// ───────────────────────────── Amounts ─────────────────────────────

const CURRENCY_ALIASES: [RegExp, string][] = [
  [/^€$/, 'EUR'],
  [/^\$$/, 'USD'],
  [/^£$/, 'GBP'],
  [/^(лв|lv|лева|leva)\.?$/i, 'BGN'],
  [/^(eur|евро|evro)$/i, 'EUR'],
];
const CODES = new Set(CURRENCIES.map((c) => c.code));

function currencyCode(token: string): string | null {
  for (const [re, code] of CURRENCY_ALIASES) if (re.test(token)) return code;
  const upper = token.toUpperCase();
  return CODES.has(upper) ? upper : null;
}

const CUR = String.raw`(€|\$|£|лв\.?|lv\.?|лева|евро|EUR|BGN|USD|GBP|CHF|RON|PLN|CZK|HUF|TRY|SEK|NOK|DKK|JPY|CAD|AUD)`;
const NUM = String.raw`([+\-−]?\s?\d{1,3}(?:[   ',.]\d{3})+(?:[.,]\d{1,2})?|[+\-−]?\s?\d+(?:[.,]\d{1,2})?)`;
const MONEY = new RegExp(
  String.raw`${CUR}\s?${NUM}(?![\d])|${NUM}\s?${CUR}(?![A-Za-zА-Яа-я])`,
  'gi',
);

/** "1 234,50" / "1,234.50" / "12.5" → "1234.50" style decimal string (no sign). */
export function normalizeDecimal(raw: string): string | null {
  let s = raw.replace(/[+\-−\s  ']/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const sepIndex = Math.max(lastDot, lastComma);
  if (sepIndex >= 0) {
    const decimals = s.length - sepIndex - 1;
    const sep = s[sepIndex];
    const sepCount = s.split(sep!).length - 1;
    const isDecimal = decimals > 0 && decimals <= 2 && !(sepCount > 1 && lastDot !== lastComma);
    if (isDecimal) {
      s = `${s.slice(0, sepIndex).replace(/[.,]/g, '')}.${s.slice(sepIndex + 1)}`;
    } else {
      s = s.replace(/[.,]/g, '');
    }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  return `${String(Number(int))}${frac ? `.${frac.padEnd(2, '0')}` : ''}`;
}

const BALANCE_WORDS =
  /(наличност|разполагаем|баланс|остат[ъа]к|лимит|nalichnost|razpolagaem|balans|balance|available|limit|total)\W*$/i;

interface MoneyMatch {
  index: number;
  sign: '+' | '-' | null;
  amount: string;
  currency: string | null;
}

/** All amounts with a currency in the text, in order, skipping balances ("Наличност: 1000 EUR"). */
export function findAmounts(text: string): MoneyMatch[] {
  const out: MoneyMatch[] = [];
  for (const m of text.matchAll(MONEY)) {
    const cur = m[1] ?? m[4];
    const num = m[2] ?? m[3];
    if (!cur || !num) continue;
    const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index);
    if (BALANCE_WORDS.test(before.replace(/[\s:=]+$/, ''))) continue;
    const amount = normalizeDecimal(num);
    if (!amount || Number(amount) === 0) continue;
    const signChar = num.trim()[0];
    const sign = signChar === '+' ? '+' : signChar === '-' || signChar === '−' ? '-' : null;
    out.push({ index: m.index ?? 0, sign, amount, currency: currencyCode(cur) });
  }
  return out;
}

// ───────────────────────────── Direction ─────────────────────────────

/** One-time codes, declined or cancelled payments and card blocks are not transactions. */
const IGNORE =
  /(\botp\b|one[- ]time|verification code|confirmation code|security code|(?<!\p{L})код(?!\p{L})|парола|3-?d ?secure|declined|rejected|not approved|unsuccessful|\bfailed|insufficient|отказан|отхвърлен|неуспешн|недостатъчн|cancel+ed|reversed|reversal|отменен|анулиран|сторн|pre-?authori[sz]|блокиран|blokiran|blocked)/iu;

const INCOME =
  /(receiv|credited|incoming|deposit|refund|cashback|salary|top[- ]?up|topped up|added to|money in|получ|постъп|приход|кредитиран|входящ|възстанов|заплат|захран|polucheni|postuplenie|postaplenie|vazstanov|zachislen)/i;
const EXPENSE =
  /(paid|payment|purchase|spent|withdraw|charged|debited|you sent|sent to|transfer to|плащане|платихте|покупка|теглене|дебит|изходящ|разход|превод към|изпратихте|plashtane|pokupka|teglene|\bpos\b|\batm\b|банкомат)/i;

function direction(text: string, sign: '+' | '-' | null): 'expense' | 'income' {
  if (sign === '+') return 'income';
  if (sign === '-') return 'expense';
  const inc = text.search(INCOME);
  const exp = text.search(EXPENSE);
  if (inc >= 0 && (exp < 0 || inc < exp)) return 'income';
  return 'expense';
}

// ───────────────────────────── Payee ─────────────────────────────

const GENERIC_TITLE =
  /^(revolut|dsk|ubb|обб|дск|kbc|google( wallet| pay)?|wallet|apple pay|payment|плащане|покупка|транзакция|трансакция|transaction|notification|известие|card|карта|new transaction|нова (транзакция|трансакция)|sms|viber|банка|bank|информация|info)(?![\p{L}\p{N}])/iu;

const LEGAL_SUFFIX =
  /(?<![\p{L}\p{N}])(e?ood|ead|ad|ltd|limited|gmbh|ag|s\.?a\.?|s\.?r\.?l\.?|inc|llc|bv|е?оод|еад|ад|bulgaria|българия|bgr?|bul)(?![\p{L}\p{N}])\.?/giu;
const CITIES =
  /(?<![\p{L}\p{N}])(sofia|plovdiv|varna|burgas|ruse|stara zagora|pleven|blagoevgrad|veliko tarnovo|софия|пловдив|варна|бургас|русе|стара загора|плевен)(?![\p{L}\p{N}])/giu;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/&.(])(\p{L})/gu, (_, p, c: string) => p + c.toUpperCase());
}

/**
 * Makes merchant names from banks readable: "POS 4***1234 LIDL BULGARIA EOOD SOFIA" → "Lidl".
 * Returns null when nothing meaningful is left.
 */
export function cleanPayee(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw
    .replace(/\s+/g, ' ')
    .replace(/\b\d{1,6}[*xX•·]{2,}\d{2,4}\b/g, ' ')
    .replace(/[*xX•·]{2,}\s?\d{2,4}\b/g, ' ')
    .replace(
      /^\s*(pos|пос|purchase|покупка|pokupka|плащане|plashtane|payment|card payment)\b[\s:-]*/i,
      '',
    )
    .replace(/\b(pos|terminal|терминал)\s*\d+\b/gi, ' ')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(CITIES, ' ')
    .replace(/\s\d{5,}\b/g, ' ')
    .replace(/[\s,;:.\-–|]+$/g, '')
    .replace(/^[\s,;:.\-–|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 2 || !/\p{L}{2}/u.test(s)) return null;
  // ALL CAPS from card terminals → Title Case; keep short brand acronyms (DM, OMV) as they are.
  if (s === s.toUpperCase() && s.length > 3) s = titleCase(s);
  return s.slice(0, 80);
}

const PAYEE_STOP =
  /^(card|карта|account|сметка|сметката|your|вашата|вашия|you|дата|date|the|a|an|apple pay|google pay|visa|mastercard|debit|кредитна|дебитна)(?![\p{L}\p{N}])/iu;

function payeeFromText(text: string): string | null {
  const re =
    /(?:^|[\s(])(?:at|in|from|to|merchant|при|в|във|от|към|търговец|обект|получател|наредител|platec|pri|ot)[:\s]+([^\n,;]+?)(?=\s+(?:on|with|using|via|за|на|с|със|чрез|по)\s|[\n,;]|\.\s|\.$|\s*\(|$)/gi;
  for (const m of text.matchAll(re)) {
    const candidate = m[1]?.trim() ?? '';
    if (!candidate || PAYEE_STOP.test(candidate) || findAmounts(candidate).length) continue;
    if (/^\d|\d{2}[./]\d{2}/.test(candidate)) continue;
    const cleaned = cleanPayee(candidate);
    if (cleaned) return cleaned;
  }
  return null;
}

function payeeFromSegments(text: string, amountIndex: number): string | null {
  const after = text.slice(amountIndex);
  const parts = after.split(/[,;\n]/).slice(1);
  for (const part of parts) {
    const p = part.trim();
    if (!p || /\d{2}[./:]\d{2}/.test(p) || findAmounts(p).length || BALANCE_WORDS.test(p)) continue;
    if (/(наличност|nalichnost|balance|available|разполагаем)/i.test(p)) continue;
    const cleaned = cleanPayee(p);
    if (cleaned && !PAYEE_STOP.test(cleaned)) return cleaned;
  }
  return null;
}

/**
 * Reads a payment notification. Returns null for texts that are not a completed transaction
 * (one-time codes, declined payments, adverts …).
 */
export function parseNotification(input: {
  app?: string | null;
  title?: string | null;
  text?: string | null;
}): ParsedNotification | null {
  const title = (input.title ?? '').trim();
  const body = (input.text ?? '').trim();
  const full = [title, body].filter(Boolean).join('\n');
  if (!full || IGNORE.test(full)) return null;
  const amounts = findAmounts(full);
  const first = amounts[0];
  if (!first) return null;
  const type = direction(full, first.sign);
  const titleIsMerchant =
    title &&
    !GENERIC_TITLE.test(title) &&
    title !== appLabel(input.app ?? '') &&
    !findAmounts(title).length &&
    !INCOME.test(title) &&
    !EXPENSE.test(title);
  const payee =
    payeeFromText(body) ??
    payeeFromText(title) ??
    (titleIsMerchant ? cleanPayee(title.replace(/^[^\p{L}\p{N}]+/u, '')) : null) ??
    payeeFromSegments(full, first.index);
  return { type, amount: first.amount, currency: first.currency, payee };
}

/** Reads a single amount typed or passed by an automation ("€12.50", "12,50", 12.5). */
export function parseLooseAmount(
  value: string | number,
): { amount: string; currency: string | null; sign: '+' | '-' | null } | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value === 0) return null;
    return {
      amount: Math.abs(value).toFixed(2).replace(/\.00$/, '.00'),
      currency: null,
      sign: value < 0 ? '-' : null,
    };
  }
  const found = findAmounts(value)[0];
  if (found) return { amount: found.amount, currency: found.currency, sign: found.sign };
  const trimmed = value.trim();
  const amount = normalizeDecimal(trimmed);
  if (!amount || Number(amount) === 0) return null;
  const c = trimmed[0];
  return { amount, currency: null, sign: c === '-' || c === '−' ? '-' : null };
}
