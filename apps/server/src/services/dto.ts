import type {
  Account,
  Budget,
  Category,
  Label,
  PlannedPayment,
  RecordItem,
  User,
} from '@dostotinka/shared';
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  LabelRow,
  PlannedPaymentRow,
  RecordRow,
  UserRow,
} from '../db/schema';

/**
 * The logged-in user as the web app sees it. `dataOwner` is the household owner for members:
 * money is shown in the owner's main currency.
 */
export function toUser(u: UserRow, dataOwner?: UserRow | null): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    baseCurrency: dataOwner && dataOwner.id !== u.id ? dataOwner.baseCurrency : u.baseCurrency,
    timezone: u.timezone,
    weekStartsOn: (u.weekStartsOn === 0 || u.weekStartsOn === 6 ? u.weekStartsOn : 1) as 0 | 1 | 6,
    theme: (['light', 'dark'].includes(u.theme) ? u.theme : 'system') as User['theme'],
    locale: u.locale,
    language: u.language,
    noteSuggestions: u.noteSuggestions,
    isDemo: u.isDemo,
    isAdmin: u.isAdmin,
    twoFactorEnabled: !!u.totpSecret,
    ssoLinked: !!u.oidcSubject,
    recoveryCodesLeft: u.totpSecret ? u.recoveryCodes.length : 0,
    automaticImport:
      dataOwner && dataOwner.id !== u.id
        ? { notifications: dataOwner.importNotifications, bank: dataOwner.importBank }
        : { notifications: u.importNotifications, bank: u.importBank },
    householdOwner:
      dataOwner && dataOwner.id !== u.id ? { id: dataOwner.id, name: dataOwner.name } : null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toAccount(
  a: AccountRow,
  totals?: { sum: number; count: number },
  /** Unrealised gain of the holdings in the account currency. */
  holdingsGain = 0,
): Account {
  const balance = a.initialBalance + (totals?.sum ?? 0);
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    initialBalance: a.initialBalance,
    balance,
    value: balance + holdingsGain,
    holdingsGain,
    color: a.color,
    icon: a.icon,
    excludeFromStats: a.excludeFromStats,
    archived: a.archived,
    sortOrder: a.sortOrder,
    note: a.note,
    recordCount: totals?.count ?? 0,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toCategory(c: CategoryRow): Category {
  return {
    id: c.id,
    parentId: c.parentId,
    kind: c.kind,
    name: c.name,
    icon: c.icon,
    color: c.color,
    archived: c.archived,
    sortOrder: c.sortOrder,
    systemKey: c.systemKey,
  };
}

export function toLabel(l: LabelRow): Label {
  return { id: l.id, name: l.name, color: l.color };
}

export function toRecord(
  r: RecordRow,
  extra: { labelIds?: string[]; counterpartAmount?: number | null; attachmentCount?: number } = {},
): RecordItem {
  return {
    id: r.id,
    accountId: r.accountId,
    type: r.type,
    amount: r.amount,
    currency: r.currency,
    categoryId: r.categoryId,
    occurredAt: r.occurredAt.toISOString(),
    note: r.note,
    payee: r.payee,
    labelIds: extra.labelIds ?? [],
    transferGroupId: r.transferGroupId,
    counterpartAccountId: r.counterpartAccountId,
    counterpartAmount: extra.counterpartAmount ?? null,
    plannedPaymentId: r.plannedPaymentId,
    attachmentCount: extra.attachmentCount ?? 0,
    debtId: r.debtId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toPlannedPayment(
  p: PlannedPaymentRow,
  currency: string,
  stats: { paidCount: number; lastPaidAt: Date | null } = { paidCount: 0, lastPaidAt: null },
): PlannedPayment {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    accountId: p.accountId,
    toAccountId: p.toAccountId,
    categoryId: p.categoryId,
    amount: p.amount,
    currency,
    note: p.note,
    payee: p.payee,
    frequency: p.frequency,
    interval: p.interval,
    startDate: p.startDate,
    endDate: p.endDate,
    nextDueDate: p.nextDueDate,
    autoConfirm: p.autoConfirm,
    paidCount: stats.paidCount,
    lastPaidAt: stats.lastPaidAt ? stats.lastPaidAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toBudget(b: BudgetRow): Budget {
  return {
    id: b.id,
    name: b.name,
    amount: b.amount,
    currency: b.currency,
    period: b.period,
    categoryIds: b.categoryIds,
    accountIds: b.accountIds,
    color: b.color,
    createdAt: b.createdAt.toISOString(),
  };
}
