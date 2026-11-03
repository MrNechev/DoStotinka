import { randomUUID } from 'node:crypto';
import { addDays, nextOccurrence, type RecurrenceRule } from '@slavotax/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../db';
import {
  accounts,
  budgets,
  categories,
  exchangeRates,
  labels,
  plannedPayments,
  recordLabels,
  records,
} from '../db/schema';
import { toLocalDate, zonedTimeToUtc } from '../lib/dates';
import { seedDefaultCategories } from '../services/categories';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const TZ = 'Europe/Sofia';
const DAYS = 400;

/** Small deterministic PRNG so the demo looks the same on every install. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DraftRecord {
  id: string;
  accountId: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  categoryId: string | null;
  occurredAt: Date;
  note: string | null;
  payee: string | null;
  transferGroupId: string | null;
  counterpartAccountId: string | null;
  plannedPaymentId: string | null;
  plannedDueDate: string | null;
  labels: string[];
}

/** Removes all data of the demo user and generates a fresh, realistic data set ending today. */
export async function generateDemoData(tx: Tx, userId: string, now = new Date()): Promise<void> {
  // Wipe existing data (sessions and the user row stay).
  await tx.delete(records).where(eq(records.userId, userId));
  await tx.delete(plannedPayments).where(eq(plannedPayments.userId, userId));
  await tx.delete(budgets).where(eq(budgets.userId, userId));
  await tx.delete(labels).where(eq(labels.userId, userId));
  await tx.delete(accounts).where(eq(accounts.userId, userId));
  await tx.delete(categories).where(eq(categories.userId, userId));
  await tx.delete(exchangeRates).where(eq(exchangeRates.userId, userId));

  const cat = await seedDefaultCategories(tx, userId);
  const C = (key: string) => {
    const id = cat.get(key);
    if (!id) throw new Error(`Unknown demo category ${key}`);
    return id;
  };

  const rand = mulberry32(20260101);
  const chance = (p: number) => rand() < p;
  const between = (min: number, max: number) => min + rand() * (max - min);
  const int = (min: number, max: number) => Math.floor(between(min, max + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
  /** Random price in cents, rounded like real prices (x.x9 / whole). */
  const price = (min: number, max: number) => {
    const v = between(min, max);
    if (v > 40 && chance(0.5)) return Math.round(v) * 100;
    return Math.round(v * 10) * 10 - (chance(0.6) ? 1 : 0);
  };

  // ─── Accounts ───
  const acc = {
    bank: randomUUID(),
    cash: randomUUID(),
    card: randomUUID(),
    savings: randomUUID(),
    usd: randomUUID(),
  };
  await tx.insert(accounts).values([
    {
      id: acc.bank,
      userId,
      name: 'Main Bank Account',
      type: 'checking',
      currency: 'EUR',
      initialBalance: 3_150_00,
      color: '#3B82F6',
      icon: 'landmark',
      sortOrder: 0,
    },
    {
      id: acc.cash,
      userId,
      name: 'Cash',
      type: 'cash',
      currency: 'EUR',
      initialBalance: 180_00,
      color: '#22C55E',
      icon: 'wallet',
      sortOrder: 1,
    },
    {
      id: acc.card,
      userId,
      name: 'Credit Card',
      type: 'credit_card',
      currency: 'EUR',
      initialBalance: 0,
      color: '#EF4444',
      icon: 'credit-card',
      sortOrder: 2,
    },
    {
      id: acc.savings,
      userId,
      name: 'Savings',
      type: 'savings',
      currency: 'EUR',
      initialBalance: 7_800_00,
      color: '#10B981',
      icon: 'piggy-bank',
      sortOrder: 3,
      note: 'Emergency fund',
    },
    {
      id: acc.usd,
      userId,
      name: 'Travel USD',
      type: 'checking',
      currency: 'USD',
      initialBalance: 420_00,
      color: '#8B5CF6',
      icon: 'globe',
      sortOrder: 4,
    },
  ]);
  await tx.insert(exchangeRates).values({ userId, currency: 'USD', rate: 0.92, source: 'default' });
  const currencyOf: Record<string, string> = { [acc.usd]: 'USD' };

  // ─── Labels ───
  const lab = {
    vacation: randomUUID(),
    work: randomUUID(),
    family: randomUUID(),
    car: randomUUID(),
  };
  await tx.insert(labels).values([
    { id: lab.vacation, userId, name: 'Vacation', color: '#14B8A6' },
    { id: lab.work, userId, name: 'Work', color: '#3B82F6' },
    { id: lab.family, userId, name: 'Family', color: '#F43F5E' },
    { id: lab.car, userId, name: 'Car', color: '#64748B' },
  ]);

  const today = toLocalDate(now, TZ);
  const start = addDays(today, -DAYS);

  // ─── Planned payments (definitions; their past occurrences are generated below) ───
  type PlanDef = {
    id: string;
    name: string;
    type: 'expense' | 'income' | 'transfer';
    accountId: string;
    toAccountId?: string;
    category?: string;
    amount: number;
    payee?: string;
    rule: RecurrenceRule;
    /** Leave the most recent past occurrence unpaid (to demo overdue payments). */
    leaveOverdue?: boolean;
    variable?: () => number;
  };
  const monthDay = (day: number) => `${start.slice(0, 7)}-${String(day).padStart(2, '0')}`;
  /** Anchors yearly schedules one year back so the past occurrence is part of the history. */
  const yearlyDate = (monthDayStr: string) => `${Number(today.slice(0, 4)) - 1}-${monthDayStr}`;
  // A bill that fell due a few days ago and is still unpaid (shows up as overdue).
  const overdueDay = Math.min(28, Number(addDays(today, -3).slice(8)));
  const plans: PlanDef[] = [
    {
      id: randomUUID(),
      name: 'Salary',
      type: 'income',
      accountId: acc.bank,
      category: 'salary.salary',
      amount: 3_450_00,
      payee: 'Northwind Software Ltd.',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(25) },
    },
    {
      id: randomUUID(),
      name: 'Rent',
      type: 'expense',
      accountId: acc.bank,
      category: 'housing.rent',
      amount: 750_00,
      payee: 'Landlord – Maria Ivanova',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(1) },
    },
    {
      id: randomUUID(),
      name: 'Electricity bill',
      type: 'expense',
      accountId: acc.bank,
      category: 'utilities.electricity',
      amount: 68_00,
      payee: 'Power Distribution Co.',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(overdueDay) },
      leaveOverdue: true,
      variable: () => price(42, 115),
    },
    {
      id: randomUUID(),
      name: 'Water',
      type: 'expense',
      accountId: acc.bank,
      category: 'utilities.water',
      amount: 24_00,
      payee: 'City Water',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(15) },
      variable: () => price(17, 32),
    },
    {
      id: randomUUID(),
      name: 'Home internet',
      type: 'expense',
      accountId: acc.bank,
      category: 'communication.internet',
      amount: 25_00,
      payee: 'FiberNet',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(5) },
    },
    {
      id: randomUUID(),
      name: 'Mobile plan',
      type: 'expense',
      accountId: acc.bank,
      category: 'communication.mobile',
      amount: 15_99,
      payee: 'MobiTel',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(5) },
    },
    {
      id: randomUUID(),
      name: 'Gym membership',
      type: 'expense',
      accountId: acc.bank,
      category: 'sport.gym',
      amount: 45_00,
      payee: 'Pulse Fitness',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(3) },
    },
    {
      id: randomUUID(),
      name: 'Netflix',
      type: 'expense',
      accountId: acc.card,
      category: 'digital.video_streaming',
      amount: 13_99,
      payee: 'Netflix',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(14) },
    },
    {
      id: randomUUID(),
      name: 'Spotify',
      type: 'expense',
      accountId: acc.card,
      category: 'digital.music_streaming',
      amount: 10_99,
      payee: 'Spotify',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(18) },
    },
    {
      id: randomUUID(),
      name: 'Cloud storage',
      type: 'expense',
      accountId: acc.usd,
      category: 'digital.cloud',
      amount: 2_99,
      payee: 'CloudDrive Inc.',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(9) },
    },
    {
      id: randomUUID(),
      name: 'Monthly savings',
      type: 'transfer',
      accountId: acc.bank,
      toAccountId: acc.savings,
      amount: 400_00,
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(26) },
    },
    {
      id: randomUUID(),
      name: 'ETF investment',
      type: 'expense',
      accountId: acc.bank,
      category: 'investments.stocks',
      amount: 150_00,
      payee: 'Broker',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(27) },
    },
    {
      id: randomUUID(),
      name: 'Car insurance',
      type: 'expense',
      accountId: acc.bank,
      category: 'vehicle.insurance',
      amount: 384_00,
      payee: 'SafeDrive Insurance',
      rule: {
        frequency: 'yearly',
        interval: 1,
        startDate: yearlyDate(`${addDays(today, 18).slice(5)}`),
      },
    },
    {
      id: randomUUID(),
      name: 'Property tax',
      type: 'expense',
      accountId: acc.bank,
      category: 'taxes.property_tax',
      amount: 86_40,
      payee: 'Municipality',
      rule: { frequency: 'yearly', interval: 1, startDate: yearlyDate('04-28') },
    },
    {
      id: randomUUID(),
      name: 'Vehicle tax',
      type: 'expense',
      accountId: acc.bank,
      category: 'taxes.vehicle_tax',
      amount: 72_00,
      payee: 'Municipality',
      rule: { frequency: 'yearly', interval: 1, startDate: yearlyDate('04-28') },
    },
    {
      id: randomUUID(),
      name: 'Road vignette',
      type: 'expense',
      accountId: acc.card,
      category: 'vehicle.tolls',
      amount: 49_00,
      payee: 'Road Agency',
      rule: { frequency: 'yearly', interval: 1, startDate: yearlyDate('01-15') },
    },
    {
      id: randomUUID(),
      name: 'Bank account fee',
      type: 'expense',
      accountId: acc.bank,
      category: 'financial.bank_fees',
      amount: 2_50,
      payee: 'Bank',
      rule: { frequency: 'monthly', interval: 1, startDate: monthDay(28) },
    },
  ];

  const drafts: DraftRecord[] = [];
  const balances: Record<string, number> = {
    [acc.bank]: 3_150_00,
    [acc.cash]: 180_00,
    [acc.card]: 0,
    [acc.savings]: 7_800_00,
    [acc.usd]: 420_00,
  };

  const at = (date: string, hour: number, minute = int(0, 59)) =>
    zonedTimeToUtc(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)),
      Number(date.slice(8, 10)),
      hour,
      minute,
      TZ,
    );

  const add = (
    date: string,
    hour: number,
    accountId: string,
    type: 'expense' | 'income',
    category: string,
    amount: number,
    extra: {
      note?: string;
      payee?: string;
      labels?: string[];
      plannedPaymentId?: string;
      plannedDueDate?: string;
    } = {},
  ) => {
    const occurredAt = at(date, hour);
    if (occurredAt > now) return;
    const signed = type === 'expense' ? -amount : amount;
    balances[accountId] = (balances[accountId] ?? 0) + signed;
    drafts.push({
      id: randomUUID(),
      accountId,
      type,
      amount: signed,
      currency: currencyOf[accountId] ?? 'EUR',
      categoryId: C(category),
      occurredAt,
      note: extra.note ?? null,
      payee: extra.payee ?? null,
      transferGroupId: null,
      counterpartAccountId: null,
      plannedPaymentId: extra.plannedPaymentId ?? null,
      plannedDueDate: extra.plannedDueDate ?? null,
      labels: extra.labels ?? [],
    });
  };

  const transfer = (
    date: string,
    hour: number,
    from: string,
    to: string,
    amount: number,
    toAmount = amount,
    extra: { note?: string; plannedPaymentId?: string; plannedDueDate?: string } = {},
  ) => {
    const occurredAt = at(date, hour);
    if (occurredAt > now || amount <= 0) return;
    const group = randomUUID();
    balances[from] = (balances[from] ?? 0) - amount;
    balances[to] = (balances[to] ?? 0) + toAmount;
    const common = {
      type: 'transfer' as const,
      categoryId: null,
      occurredAt,
      note: extra.note ?? null,
      payee: null,
      transferGroupId: group,
      plannedPaymentId: extra.plannedPaymentId ?? null,
      plannedDueDate: extra.plannedDueDate ?? null,
      labels: [],
    };
    drafts.push({
      ...common,
      id: randomUUID(),
      accountId: from,
      amount: -amount,
      currency: currencyOf[from] ?? 'EUR',
      counterpartAccountId: to,
    });
    drafts.push({
      ...common,
      id: randomUUID(),
      accountId: to,
      amount: toAmount,
      currency: currencyOf[to] ?? 'EUR',
      counterpartAccountId: from,
    });
  };

  // ─── Planned payment history ───
  const nextDue = new Map<string, string | null>();
  for (const plan of plans) {
    let due = nextOccurrence(plan.rule, start, true);
    let lastPast: string | null = null;
    while (due && due <= today) {
      lastPast = due;
      due = nextOccurrence(plan.rule, due);
    }
    let cursor = nextOccurrence(plan.rule, start, true);
    while (cursor && cursor <= today) {
      const isOverdue = plan.leaveOverdue && cursor === lastPast && cursor >= addDays(today, -6);
      if (!isOverdue) {
        const amount = plan.variable ? plan.variable() : plan.amount;
        const payDate =
          plan.type === 'income' || plan.type === 'transfer' ? cursor : addDays(cursor, int(0, 1));
        const meta = {
          plannedPaymentId: plan.id,
          plannedDueDate: cursor,
          payee: plan.payee,
          note: plan.type === 'transfer' ? plan.name : undefined,
        };
        if (plan.type === 'transfer') {
          transfer(payDate, 10, plan.accountId, plan.toAccountId!, amount, amount, { ...meta });
        } else {
          add(
            payDate > today ? today : payDate,
            plan.type === 'income' ? 9 : int(8, 19),
            plan.accountId,
            plan.type,
            plan.category!,
            amount,
            meta,
          );
        }
      }
      cursor = nextOccurrence(plan.rule, cursor);
    }
    nextDue.set(
      plan.id,
      plan.leaveOverdue && lastPast && lastPast >= addDays(today, -6) ? lastPast : due,
    );
  }

  // ─── Daily life ───
  const grocers = ['Lidl', 'Kaufland', 'Billa', 'Fantastico', 'Local market'];
  const cafes = ['Coffee Corner', 'Barista Bar', 'Café Central', 'Starbucks'];
  const restaurants = [
    'Trattoria Roma',
    'Happy Bar & Grill',
    'Sushi Zone',
    'The Old House',
    'Mezze Bistro',
    'Green Bowl',
  ];
  const fastFood = ['Burger Lab', 'Doner House', 'Pizza Express', 'Subway'];
  const clothesShops = ['Zara', 'H&M', 'Reserved', 'Decathlon', 'Mango'];
  const fuelStations = ['Shell', 'OMV', 'Lukoil', 'Eko'];
  const bookShops = ['Helikon', 'Ciela', 'Amazon'];

  for (let date = start; date <= today; date = addDays(date, 1)) {
    const d = new Date(`${date}T12:00:00Z`);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const month = d.getUTCMonth() + 1;
    const dom = d.getUTCDate();
    const payWith = () => (chance(0.55) ? acc.card : chance(0.5) ? acc.bank : acc.cash);

    // Groceries ~3 times a week, bigger on weekends.
    if (chance(weekend ? 0.55 : 0.32)) {
      add(
        date,
        int(17, 20),
        payWith(),
        'expense',
        'food.groceries',
        weekend ? price(35, 110) : price(9, 48),
        { payee: pick(grocers) },
      );
    }
    if (chance(0.06))
      add(date, int(8, 11), acc.cash, 'expense', 'food.market', price(6, 22), {
        payee: 'Farmers market',
      });
    if (!weekend && chance(0.55))
      add(
        date,
        int(8, 10),
        chance(0.6) ? acc.cash : acc.card,
        'expense',
        'food.cafe',
        price(2.2, 5.8),
        { payee: pick(cafes) },
      );
    if (weekend && chance(0.4))
      add(date, int(10, 16), acc.card, 'expense', 'food.cafe', price(4, 12), {
        payee: pick(cafes),
      });
    if (!weekend && chance(0.35))
      add(date, int(12, 13), payWith(), 'expense', 'food.canteen', price(6, 11), {
        payee: 'Office canteen',
      });
    if (chance(weekend ? 0.3 : 0.1))
      add(date, int(19, 21), acc.card, 'expense', 'food.restaurants', price(28, 85), {
        payee: pick(restaurants),
      });
    if (chance(0.11))
      add(
        date,
        int(12, 21),
        payWith(),
        'expense',
        pick(['food.fast_food', 'food.delivery']),
        price(9, 26),
        { payee: pick(fastFood) },
      );
    if (chance(weekend ? 0.16 : 0.04))
      add(date, int(20, 23), acc.cash, 'expense', 'food.bar', price(12, 48), {
        payee: pick(['The Pub', 'Rooftop Bar', 'Craft Beer Spot']),
      });
    if (chance(0.08)) add(date, int(9, 19), payWith(), 'expense', 'food.bakery', price(2, 9));

    // Transport & car
    if (dom % 9 === 0 || (chance(0.04) && !weekend)) {
      add(date, int(7, 20), acc.card, 'expense', 'vehicle.fuel', price(52, 78), {
        payee: pick(fuelStations),
        labels: [lab.car],
      });
    }
    if (chance(0.12))
      add(date, int(9, 18), acc.cash, 'expense', 'vehicle.parking', price(1.5, 8), {
        payee: 'City parking',
      });
    if (dom === 20 && chance(0.7))
      add(date, int(10, 17), acc.cash, 'expense', 'vehicle.car_wash', price(8, 16), {
        labels: [lab.car],
      });
    if ((month === 4 || month === 10) && dom === 11)
      add(date, 11, acc.bank, 'expense', 'vehicle.service', price(180, 340), {
        payee: 'AutoService Pro',
        note: 'Scheduled service',
        labels: [lab.car],
      });
    if (month === 11 && dom === 6)
      add(date, 15, acc.card, 'expense', 'vehicle.tires', 360_00, {
        payee: 'TyreMax',
        note: 'Winter tires',
        labels: [lab.car],
      });
    if (!weekend && chance(0.12))
      add(date, int(7, 9), acc.cash, 'expense', 'transport.public', 1_60, {
        payee: 'Public transport',
      });
    if (chance(0.06))
      add(date, int(19, 23), acc.card, 'expense', 'transport.taxi', price(5, 16), {
        payee: pick(['Uber', 'Bolt', 'Yellow Taxi']),
      });

    // Health & personal care
    if (chance(0.06))
      add(date, int(9, 19), payWith(), 'expense', 'health.pharmacy', price(6, 38), {
        payee: 'Pharmacy',
      });
    if (dom === 8 && month % 4 === 0)
      add(date, 10, acc.bank, 'expense', 'health.dentist', price(45, 140), {
        payee: 'Smile Dental',
      });
    if (dom === 21 && month % 5 === 0)
      add(date, 10, acc.bank, 'expense', 'health.doctor', price(35, 70), {
        payee: 'Medical Center',
      });
    if (chance(0.025))
      add(date, int(9, 19), acc.card, 'expense', 'health.supplements', price(12, 35));
    if (dom === 16 || (dom === 2 && chance(0.3)))
      add(date, int(10, 18), acc.cash, 'expense', 'personal_care.hairdresser', price(15, 28), {
        payee: 'Barber Shop',
      });

    // Shopping
    if (chance(0.04))
      add(date, int(11, 20), acc.card, 'expense', 'shopping.clothes', price(25, 130), {
        payee: pick(clothesShops),
      });
    if (chance(0.012))
      add(date, int(11, 20), acc.card, 'expense', 'shopping.shoes', price(55, 140), {
        payee: pick(clothesShops),
      });
    if (chance(0.06))
      add(date, int(10, 20), payWith(), 'expense', 'shopping.household', price(6, 32), {
        payee: pick(['dm', 'Lilly Drogerie', 'Kaufland']),
      });
    if (chance(0.05))
      add(date, int(10, 20), payWith(), 'expense', 'shopping.drugstore', price(5, 26), {
        payee: pick(['dm', 'Lilly Drogerie']),
      });
    if (chance(0.03))
      add(date, int(10, 21), acc.card, 'expense', 'shopping.books', price(12, 32), {
        payee: pick(bookShops),
      });
    if (chance(0.015))
      add(date, int(10, 21), acc.card, 'expense', 'shopping.electronics', price(25, 180), {
        payee: pick(['Technopolis', 'Amazon', 'Emag']),
      });
    if (chance(0.008))
      add(date, int(10, 21), acc.card, 'expense', 'shopping.home_decor', price(20, 120), {
        payee: 'IKEA',
      });
    if (chance(0.01))
      add(date, int(10, 18), acc.card, 'expense', 'shopping.garden', price(8, 45), {
        payee: 'Garden Center',
      });
    if (month === 3 && dom === 14)
      add(date, 18, acc.card, 'expense', 'shopping.electronics', 699_00, {
        payee: 'Technopolis',
        note: 'New phone',
      });

    // Pets
    if (dom === 4 || dom === 19)
      add(date, int(17, 19), payWith(), 'expense', 'pets.food', price(14, 32), {
        payee: 'Pet Shop',
        note: 'Food for Luna',
      });
    if (dom === 23 && month % 6 === 2)
      add(date, 11, acc.bank, 'expense', 'pets.vet', price(35, 95), {
        payee: 'Vet Clinic',
        note: 'Check-up',
      });

    // Entertainment & hobbies
    if (chance(weekend ? 0.1 : 0.02))
      add(date, int(18, 21), acc.card, 'expense', 'entertainment.cinema', price(9, 22), {
        payee: 'Cinema City',
      });
    if (chance(0.008))
      add(date, 19, acc.card, 'expense', 'entertainment.concerts', price(35, 95), {
        payee: 'Ticket Portal',
      });
    if (chance(0.01))
      add(date, int(10, 18), acc.card, 'expense', 'entertainment.museums', price(5, 15));
    if (chance(0.015))
      add(date, int(10, 20), acc.card, 'expense', 'entertainment.hobbies', price(10, 60), {
        note: 'Photography gear',
      });
    if (chance(0.006))
      add(date, int(10, 20), acc.card, 'expense', 'digital.games', price(15, 60), {
        payee: 'Steam',
      });
    if (chance(0.01))
      add(date, int(10, 20), acc.card, 'expense', 'education.online', price(12, 90), {
        payee: 'Udemy',
        labels: [lab.work],
      });

    // Gifts & donations
    if (chance(0.012))
      add(date, int(11, 19), acc.card, 'expense', 'gifts.gifts', price(20, 90), {
        labels: [lab.family],
      });
    if (chance(0.01)) add(date, int(11, 19), acc.cash, 'expense', 'gifts.flowers', price(10, 35));
    if (month === 12 && dom >= 10 && dom <= 22 && chance(0.35))
      add(date, int(12, 20), acc.card, 'expense', 'gifts.gifts', price(25, 140), {
        note: 'Christmas gifts',
        labels: [lab.family],
      });
    if (dom === 1 && chance(0.4))
      add(date, 12, acc.bank, 'expense', 'gifts.charity', price(10, 30), { payee: 'Red Cross' });

    // Utilities extras
    if ((month >= 11 || month <= 3) && dom === 17)
      add(date, 10, acc.bank, 'expense', 'utilities.heating', price(65, 150), {
        payee: 'District Heating',
      });

    // Holidays: summer trip (EUR) and autumn city trip (USD)
    if (month === 7 && dom === 20) {
      add(date, 9, acc.card, 'expense', 'travel.flights', 318_00, {
        payee: 'Aegean Airlines',
        note: 'Flights to Crete',
        labels: [lab.vacation],
      });
      add(date, 9, acc.card, 'expense', 'travel.accommodation', 640_00, {
        payee: 'Booking.com',
        note: 'Hotel, 6 nights',
        labels: [lab.vacation],
      });
    }
    if (month === 8 && dom >= 3 && dom <= 9) {
      add(date, int(12, 15), acc.card, 'expense', 'food.restaurants', price(35, 80), {
        note: 'Crete',
        labels: [lab.vacation],
      });
      if (chance(0.5))
        add(date, int(10, 16), acc.cash, 'expense', 'travel.activities', price(20, 70), {
          note: 'Crete',
          labels: [lab.vacation],
        });
      if (dom === 9)
        add(date, 18, acc.cash, 'expense', 'travel.souvenirs', price(15, 45), {
          labels: [lab.vacation],
        });
    }
    if (month === 8 && dom === 28)
      transfer(date, 10, acc.bank, acc.usd, 900_00, 975_00, {
        note: 'Currency exchange for the trip',
      });
    if (month === 10 && dom >= 9 && dom <= 13) {
      add(date, int(12, 21), acc.usd, 'expense', 'food.restaurants', price(25, 70), {
        note: 'New York',
        labels: [lab.vacation],
      });
      if (chance(0.6))
        add(date, int(10, 18), acc.usd, 'expense', 'travel.activities', price(20, 45), {
          note: 'New York',
          labels: [lab.vacation],
        });
      if (chance(0.5))
        add(date, int(8, 22), acc.usd, 'expense', 'transport.public', price(3, 9), {
          payee: 'MTA',
          labels: [lab.vacation],
        });
    }
    if (month === 9 && dom === 1) {
      add(date, 10, acc.card, 'expense', 'travel.flights', 540_00, {
        payee: 'Lufthansa',
        note: 'Flights to New York',
        labels: [lab.vacation],
      });
      add(date, 10, acc.usd, 'expense', 'travel.accommodation', 690_00, {
        payee: 'Hotel Manhattan',
        labels: [lab.vacation],
      });
    }

    // Extra income
    if (chance(0.045)) {
      add(date, int(10, 17), acc.bank, 'income', 'business_income.freelance', price(180, 950), {
        payee: pick(['Blue Pixel Studio', 'Acme Corp.', 'Nordic Design', 'Local Bakery']),
        note: 'Website project',
        labels: [lab.work],
      });
    }
    if (dom === 25 && (month === 6 || month === 12))
      add(date, 9, acc.bank, 'income', 'salary.bonus', month === 12 ? 1_400_00 : 800_00, {
        payee: 'Northwind Software Ltd.',
        note: month === 12 ? 'Christmas bonus' : 'Mid-year bonus',
      });
    if (dom === 28)
      add(
        date,
        6,
        acc.savings,
        'income',
        'investment_income.interest',
        Math.round((balances[acc.savings] ?? 0) * 0.0021),
        { payee: 'Bank', note: 'Monthly interest' },
      );
    if (dom === 15 && month % 3 === 0)
      add(date, 8, acc.usd, 'income', 'investment_income.dividends', price(38, 72), {
        payee: 'Broker',
      });
    if (chance(0.006))
      add(date, int(10, 19), acc.cash, 'income', 'sales.used_items', price(20, 140), {
        note: 'Sold on marketplace',
      });
    if (chance(0.004))
      add(date, int(10, 19), acc.bank, 'income', 'refunds.purchase', price(15, 80), {
        note: 'Returned item',
      });
    if (month === 5 && dom === 15)
      add(date, 11, acc.bank, 'income', 'benefits.tax_refund', 212_00, { payee: 'Tax Agency' });
    if (month === 3 && dom === 3)
      add(date, 18, acc.cash, 'income', 'gifts_income.gifts', 150_00, {
        note: 'Birthday gift',
        labels: [lab.family],
      });

    // ATM withdrawals when cash runs low
    if ((balances[acc.cash] ?? 0) < 60_00 && chance(0.7)) {
      transfer(date, int(9, 18), acc.bank, acc.cash, pick([100_00, 150_00, 200_00]), undefined, {
        note: 'ATM withdrawal',
      });
    }
    // Credit card statement paid in full on the 20th
    if (dom === 20 && (balances[acc.card] ?? 0) < 0) {
      transfer(date, 8, acc.bank, acc.card, -(balances[acc.card] ?? 0), undefined, {
        note: 'Credit card statement',
      });
    }
  }

  // ─── Persist ───
  await tx.insert(plannedPayments).values(
    plans.map((p) => ({
      id: p.id,
      userId,
      name: p.name,
      type: p.type,
      accountId: p.accountId,
      toAccountId: p.toAccountId ?? null,
      categoryId: p.category ? C(p.category) : null,
      amount: p.amount,
      payee: p.payee ?? null,
      frequency: p.rule.frequency,
      interval: p.rule.interval,
      startDate: p.rule.startDate,
      endDate: null,
      nextDueDate: nextDue.get(p.id) ?? null,
    })),
  );

  drafts.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (let i = 0; i < drafts.length; i += 1000) {
    const chunk = drafts.slice(i, i + 1000);
    await tx.insert(records).values(
      chunk.map(({ labels: _labels, ...r }) => ({
        ...r,
        userId,
        createdAt: r.occurredAt,
        updatedAt: r.occurredAt,
      })),
    );
    const links = chunk.flatMap((r) => r.labels.map((labelId) => ({ recordId: r.id, labelId })));
    if (links.length) await tx.insert(recordLabels).values(links);
  }

  await tx.insert(budgets).values([
    {
      userId,
      name: 'Groceries',
      amount: 420_00,
      currency: 'EUR',
      period: 'month',
      categoryIds: [C('food.groceries'), C('food.market')],
      color: '#F97316',
    },
    {
      userId,
      name: 'Eating out',
      amount: 260_00,
      currency: 'EUR',
      period: 'month',
      categoryIds: [
        C('food.restaurants'),
        C('food.fast_food'),
        C('food.delivery'),
        C('food.cafe'),
        C('food.bar'),
        C('food.canteen'),
      ],
      color: '#EC4899',
    },
    {
      userId,
      name: 'Shopping',
      amount: 250_00,
      currency: 'EUR',
      period: 'month',
      categoryIds: [C('shopping')],
      color: '#8B5CF6',
    },
    {
      userId,
      name: 'Car & transport',
      amount: 320_00,
      currency: 'EUR',
      period: 'month',
      categoryIds: [C('vehicle'), C('transport')],
      color: '#64748B',
    },
    {
      userId,
      name: 'Fun money',
      amount: 35_00,
      currency: 'EUR',
      period: 'week',
      categoryIds: [C('entertainment')],
      color: '#A855F7',
    },
    {
      userId,
      name: 'Travel',
      amount: 2_800_00,
      currency: 'EUR',
      period: 'year',
      categoryIds: [C('travel')],
      color: '#14B8A6',
    },
  ]);
}
