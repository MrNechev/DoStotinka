import { describe, expect, it } from 'vitest';
import {
  cleanPayee,
  findAmounts,
  normalizeDecimal,
  parseLooseAmount,
  parseNotification,
} from '../src/notifications';

// The texts below are modelled on real notification styles. Real samples from users are welcome –
// add them here whenever a bank changes its wording.
describe('parseNotification', () => {
  const cases: [string, { app?: string; title?: string; text: string }, unknown][] = [
    [
      'Google Wallet tap-to-pay',
      {
        app: 'com.google.android.apps.walletnfcrel',
        title: 'LIDL',
        text: '€12.50 with Visa •••• 1234',
      },
      { type: 'expense', amount: '12.50', currency: 'EUR', payee: 'Lidl' },
    ],
    [
      'Revolut card payment',
      { app: 'com.revolut.revolut', title: '🛒 Kaufland', text: 'You paid €23.40' },
      { type: 'expense', amount: '23.40', currency: 'EUR', payee: 'Kaufland' },
    ],
    [
      'Revolut payment with merchant in text',
      { app: 'com.revolut.revolut', title: 'Revolut', text: 'Paid €4.80 at Costa Coffee' },
      { type: 'expense', amount: '4.80', currency: 'EUR', payee: 'Costa Coffee' },
    ],
    [
      'Revolut money received',
      { app: 'com.revolut.revolut', title: 'Revolut', text: 'You received €50 from Ivan Petrov' },
      { type: 'income', amount: '50', currency: 'EUR', payee: 'Ivan Petrov' },
    ],
    [
      'UBB card payment with balance',
      {
        app: 'ОББ Мобайл',
        title: 'Плащане с карта',
        text: 'Плащане с карта 4***1234 за 12.50 EUR при LIDL BULGARIA EOOD SOFIA. Наличност: 1 000.00 EUR',
      },
      { type: 'expense', amount: '12.50', currency: 'EUR', payee: 'Lidl' },
    ],
    [
      'DSK SMS in Latin letters',
      {
        app: 'SMS',
        title: 'DSK',
        text: 'Pokupka 35,20 EUR, BILLA 123 SOFIA, 13.11.2026 12:34, nalichnost 512,07 EUR',
      },
      { type: 'expense', amount: '35.20', currency: 'EUR', payee: 'Billa 123' },
    ],
    [
      'Incoming transfer in Bulgarian',
      { title: 'ДСК', text: 'Получихте превод 1 500,00 EUR от ИВАН ПЕТРОВ' },
      { type: 'income', amount: '1500.00', currency: 'EUR', payee: 'Иван Петров' },
    ],
    [
      'Old lev amounts',
      { title: 'Плащане', text: 'Плащане 25.40 лв. в KAUFLAND' },
      { type: 'expense', amount: '25.40', currency: 'BGN', payee: 'Kaufland' },
    ],
    [
      'ATM withdrawal',
      { title: 'DSK', text: 'Teglene ot ATM 100.00 EUR, nalichnost 300.00 EUR' },
      { type: 'expense', amount: '100.00', currency: 'EUR', payee: null },
    ],
    [
      'Refund',
      { title: 'Revolut', text: 'Refund of €9.99 from Netflix' },
      { type: 'income', amount: '9.99', currency: 'EUR', payee: 'Netflix' },
    ],
    [
      'Explicit plus sign',
      { title: 'Salary', text: '+2,350.00 EUR' },
      { type: 'income', amount: '2350.00', currency: 'EUR', payee: null },
    ],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(parseNotification(input)).toEqual(expected);
    });
  }

  it.each([
    ['one-time code', 'Код за потвърждение 123456 за плащане на 12.50 EUR'],
    ['declined', 'Your payment of €5.00 at Netflix was declined'],
    ['3-D Secure', '3D Secure code 4411 for 99.00 EUR at amazon.de'],
    ['no amount', 'Your new card is on its way'],
    ['number without currency', 'Order 123456 is ready'],
    ['cancelled', 'Отменена операция 12.00 EUR при SHELL'],
  ])('ignores %s', (_, text) => {
    expect(parseNotification({ title: 'Bank', text })).toBeNull();
  });
});

describe('amount helpers', () => {
  it('normalizes decimal separators', () => {
    expect(normalizeDecimal('1 234,50')).toBe('1234.50');
    expect(normalizeDecimal('1,234.5')).toBe('1234.50');
    expect(normalizeDecimal('1.234')).toBe('1234');
    expect(normalizeDecimal('12,3')).toBe('12.30');
    expect(normalizeDecimal('0.99')).toBe('0.99');
    expect(normalizeDecimal('abc')).toBeNull();
  });

  it('skips balances', () => {
    const found = findAmounts('Наличност: 900.00 EUR. Покупка 10.00 EUR');
    expect(found.map((f) => f.amount)).toEqual(['10.00']);
  });

  it('reads loose amounts from automations', () => {
    expect(parseLooseAmount('€12.50')).toEqual({ amount: '12.50', currency: 'EUR', sign: null });
    expect(parseLooseAmount('12,50')).toEqual({ amount: '12.50', currency: null, sign: null });
    expect(parseLooseAmount(7.5)).toEqual({ amount: '7.50', currency: null, sign: null });
    expect(parseLooseAmount('-3 EUR')).toEqual({ amount: '3', currency: 'EUR', sign: '-' });
    expect(parseLooseAmount('free')).toBeNull();
  });
});

describe('cleanPayee', () => {
  it.each([
    ['POS 4***1234 LIDL BULGARIA EOOD SOFIA', 'Lidl'],
    ['KAUFLAND BULGARIA EOOD & KO KD', 'Kaufland & Ko Kd'],
    ['Netflix.com', 'Netflix.com'],
    ['OMV', 'OMV'],
    ['ЛИДЛ БЪЛГАРИЯ ЕООД', 'Лидл'],
    ['123456', null],
    ['', null],
  ])('%s → %s', (raw, expected) => {
    expect(cleanPayee(raw)).toBe(expected);
  });
});
