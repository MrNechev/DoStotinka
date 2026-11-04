import type {
  Account,
  Budget,
  Category,
  Label,
  PlannedPayment,
  RecordItem,
  User,
} from '@slavotax/shared';
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  LabelRow,
  PlannedPaymentRow,
  RecordRow,
  UserRow,
} from '../db/schema';

export function toUser(u: UserRow): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    baseCurrency: u.baseCurrency,
    timezone: u.timezone,
    weekStartsOn: (u.weekStartsOn === 0 || u.weekStartsOn === 6 ? u.weekStartsOn : 1) as 0 | 1 | 6,
    theme: (['light', 'dark'].includes(u.theme) ? u.theme : 'system') as User['theme'],
    locale: u.locale,
    language: u.language,
    isDemo: u.isDemo,
    isAdmin: u.isAdmin,
    twoFactorEnabled: !!u.totpSecret,
    recoveryCodesLeft: u.totpSecret ? u.recoveryCodes.length : 0,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toAccount(a: AccountRow, totals?: { sum: number; count: number }): Account {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    initialBalance: a.initialBalance,
    balance: a.initialBalance + (totals?.sum ?? 0),
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
