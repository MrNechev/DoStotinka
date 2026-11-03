/**
 * Supported currencies (ISO 4217).
 *
 * `decimals` is the number of minor units used when storing amounts as integers
 * (e.g. 1234 with 2 decimals = 12.34).
 */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const DEFAULT_CURRENCY = 'EUR';

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', decimals: 2 },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimals: 2 },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', decimals: 2 },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimals: 2 },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimals: 2 },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2 },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2 },
  { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr', decimals: 0 },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин', decimals: 2 },
  { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден', decimals: 2 },
  { code: 'BAM', name: 'Bosnia-Herzegovina Mark', symbol: 'KM', decimals: 2 },
  { code: 'ALL', name: 'Albanian Lek', symbol: 'L', decimals: 2 },
  { code: 'MDL', name: 'Moldovan Leu', symbol: 'L', decimals: 2 },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimals: 2 },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾', decimals: 2 },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimals: 2 },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2 },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2 },
  { code: 'VND', name: 'Vietnamese Đồng', symbol: '₫', decimals: 0 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', decimals: 2 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR', decimals: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', decimals: 3 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3 },
  { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪', decimals: 2 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'MAD', decimals: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2 },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', decimals: 2 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  { code: 'ARS', name: 'Argentine Peso', symbol: 'AR$', decimals: 2 },
  { code: 'CLP', name: 'Chilean Peso', symbol: 'CL$', decimals: 0 },
  { code: 'COP', name: 'Colombian Peso', symbol: 'CO$', decimals: 2 },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimals: 2 },
  { code: 'BTC', name: 'Bitcoin', symbol: '₿', decimals: 8 },
] as const;

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [string, ...string[]];

export function isSupportedCurrency(code: string): boolean {
  return BY_CODE.has(code);
}

export function getCurrency(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, name: code, symbol: code, decimals: 2 };
}

export function currencyDecimals(code: string): number {
  return getCurrency(code).decimals;
}

/**
 * Irrevocably fixed conversion rates for currencies that were replaced by the euro.
 * Value = units of the legacy currency per 1 EUR.
 */
export const FIXED_EUR_RATES: Readonly<Record<string, number>> = {
  BGN: 1.95583,
};
