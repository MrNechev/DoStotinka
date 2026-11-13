// Types and request schemas of the automatic import (inbox, phone notifications, open banking).
import { z } from 'zod';

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date (YYYY-MM-DD)');

export const INBOX_STATUSES = [
  'pending',
  'confirmed',
  'dismissed',
  'duplicate',
  'ignored',
] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export interface InboxItem {
  id: string;
  origin: 'notification' | 'bank';
  /** Bank name or app name the transaction came from. */
  sourceLabel: string;
  app: string | null;
  accountId: string | null;
  type: 'expense' | 'income';
  /** Positive, minor units of `currency`. Null for ignored notifications. */
  amount: number | null;
  currency: string | null;
  occurredAt: string;
  payee: string | null;
  description: string | null;
  status: InboxStatus;
  categoryId: string | null;
  /** Note and labels for the record (from rules). */
  note: string | null;
  labelIds: string[];
  recordId: string | null;
  /** An existing record that may be the same transaction. */
  match: { recordId: string; occurredAt: string; payee: string | null; note: string | null } | null;
  /** A probable transfer partner (money leaving one own account and arriving in another). */
  pair: { itemId: string; accountId: string | null; type: 'expense' | 'income' } | null;
  duplicateOfId: string | null;
  createdAt: string;
}

export interface InboxCounts {
  pending: number;
}

export interface NotificationSource {
  id: string;
  name: string;
  enabled: boolean;
  autoConfirm: boolean;
  lastReceivedAt: string | null;
  createdAt: string;
}

export interface CreatedNotificationSource extends NotificationSource {
  /** Shown only once. */
  token: string;
}

export interface NotificationApp {
  id: string;
  app: string;
  label: string;
  accountId: string | null;
  enabled: boolean;
  lastSeenAt: string;
}

export interface BankAccountLink {
  id: string;
  name: string | null;
  iban: string | null;
  currency: string | null;
  accountId: string | null;
  enabled: boolean;
  importFrom: string;
  lastBookingDate: string | null;
  balance: number | null;
  balanceAt: string | null;
}

export type BankConnectionStatus = 'pending' | 'active' | 'expired' | 'error';

export interface BankConnection {
  id: string;
  bankName: string;
  bankCountry: string;
  status: BankConnectionStatus;
  validUntil: string | null;
  enabled: boolean;
  autoConfirm: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  accounts: BankAccountLink[];
  createdAt: string;
}

export interface AutomaticImportState {
  /** False when the administrator switched the feature off for the whole server. */
  available: boolean;
  notificationsEnabled: boolean;
  bankEnabled: boolean;
  sources: NotificationSource[];
  apps: NotificationApp[];
  bank: {
    /** The user's Enable Banking application is set up. */
    configured: boolean;
    applicationId: string | null;
    /** Register exactly this URL as redirect URL of the Enable Banking application. */
    redirectUrl: string;
    connections: BankConnection[];
  };
}

export interface Bank {
  name: string;
  country: string;
  logo: string | null;
  /** Longest consent the bank allows, in days. */
  maxConsentDays: number | null;
}

// ───────────────────────────── Requests ─────────────────────────────

export const automaticImportSettingsInput = z.object({
  notificationsEnabled: z.boolean().optional(),
  bankEnabled: z.boolean().optional(),
});

export const notificationSourceInput = z.object({
  name: z.string().trim().min(1).max(60),
});

export const notificationSourceUpdate = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  autoConfirm: z.boolean().optional(),
});

export const notificationAppUpdate = z.object({
  accountId: uuid.nullable().optional(),
  enabled: z.boolean().optional(),
});

/**
 * What a phone automation posts. Either raw notification text (`title`/`text`, parsed on the
 * server) or already structured data (`amount` + `merchant`, e.g. from iOS Shortcuts).
 */
export const notificationIngest = z.object({
  app: z.string().trim().max(200).optional(),
  title: z.string().max(2000).optional(),
  text: z.string().max(4000).optional(),
  /** When the notification was shown: ISO date-time or Unix milliseconds. Default: now. */
  time: z.union([z.string().max(40), z.number()]).optional(),
  amount: z.union([z.string().max(40), z.number()]).optional(),
  currency: z.string().trim().length(3).optional(),
  merchant: z.string().trim().max(200).optional(),
  type: z.enum(['expense', 'income']).optional(),
});
export type NotificationIngest = z.infer<typeof notificationIngest>;

export interface IngestResult {
  status: 'created' | 'confirmed' | 'duplicate' | 'ignored';
  itemId?: string;
}

export const inboxListQuery = z.object({
  status: z.enum(['pending', 'done', 'ignored']).default('pending'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const inboxConfirmInput = z.object({
  accountId: uuid.optional(),
  type: z.enum(['expense', 'income']).optional(),
  categoryId: uuid.nullable().optional(),
  payee: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  /** Positive minor units in the account currency – overrides the imported amount. */
  amount: z.number().int().positive().optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});
export type InboxConfirmInput = z.infer<typeof inboxConfirmInput>;

export const inboxUpdateInput = z.object({
  accountId: uuid.nullable().optional(),
  type: z.enum(['expense', 'income']).optional(),
  categoryId: uuid.nullable().optional(),
  payee: z.string().trim().max(200).nullable().optional(),
});

export const inboxBulkInput = z.object({
  ids: z.array(uuid).min(1).max(500),
  action: z.enum(['confirm', 'dismiss']),
});

export const bankCredentialsInput = z.object({
  applicationId: z.string().trim().min(8).max(100),
  privateKey: z
    .string()
    .trim()
    .min(100)
    .max(20000)
    .refine((v) => v.includes('PRIVATE KEY'), 'Expected a PEM private key (.pem file)'),
});

export const bankConnectInput = z.object({
  bankName: z.string().trim().min(1).max(200),
  country: z.string().trim().length(2).toUpperCase(),
  /** Replace an expired connection (keeps its account links). */
  renewConnectionId: uuid.optional(),
});

export const bankCallbackInput = z.object({
  state: z.string().min(10).max(200),
  code: z.string().min(1).max(2000).optional(),
  error: z.string().max(500).optional(),
  errorDescription: z.string().max(2000).optional(),
});

export const bankConnectionUpdate = z.object({
  enabled: z.boolean().optional(),
  autoConfirm: z.boolean().optional(),
});

export const bankAccountUpdate = z.object({
  accountId: uuid.nullable().optional(),
  enabled: z.boolean().optional(),
  importFrom: isoDate.optional(),
});
