import { z } from 'zod';

/**
 * Rules: "payee contains LIDL → category Groceries, payee Lidl, label Food". They fill in imported
 * transactions (inbox, CSV) and suggest the category while a record is typed.
 */

/** Which text a rule looks at: payee, note, or any of them (plus the bank/notification text). */
export const RULE_FIELDS = ['any', 'payee', 'note'] as const;
export type RuleField = (typeof RULE_FIELDS)[number];
export const RULE_MATCHES = ['contains', 'starts', 'equals'] as const;
export type RuleMatch = (typeof RULE_MATCHES)[number];

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  position: number;
  field: RuleField;
  match: RuleMatch;
  pattern: string;
  /** Only for expenses or income (null = both). */
  recordType: 'expense' | 'income' | null;
  /** Only for this account (null = all). */
  accountId: string | null;
  /** Actions – null / empty = leave as it is. */
  categoryId: string | null;
  setPayee: string | null;
  /** Written when the note is empty. */
  setNote: string | null;
  labelIds: string[];
  createdAt: string;
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const ruleInput = z
  .object({
    name: z.string().trim().max(60).default(''),
    enabled: z.boolean().default(true),
    field: z.enum(RULE_FIELDS).default('any'),
    match: z.enum(RULE_MATCHES).default('contains'),
    pattern: z.string().trim().min(1).max(120),
    recordType: z.enum(['expense', 'income']).nullable().default(null),
    accountId: z.uuid().nullable().default(null),
    categoryId: z.uuid().nullable().default(null),
    setPayee: text(120),
    setNote: text(500),
    labelIds: z.array(z.uuid()).max(20).default([]),
  })
  .refine((r) => r.categoryId || r.setPayee || r.setNote || r.labelIds.length, {
    message: 'Choose at least one thing the rule changes',
  });
export type RuleInput = z.input<typeof ruleInput>;

export const ruleOrderInput = z.object({ ids: z.array(z.uuid()).max(500) });

export const applyRuleInput = z.object({
  /** Only count the records the rule would change. */
  dryRun: z.boolean().default(false),
  /** Also replace categories that are already set (otherwise only uncategorised records). */
  overwriteCategory: z.boolean().default(false),
});
export interface ApplyRuleResult {
  matched: number;
  changed: number;
}

export const renamePayeeInput = z.object({
  from: z.string().min(1).max(200),
  to: z.string().trim().min(1).max(120),
});
export interface PayeeUsage {
  payee: string;
  count: number;
  lastUsed: string;
}

/** What a rule is matched against. */
export interface RuleSubject {
  type: 'expense' | 'income' | 'transfer';
  accountId?: string | null;
  payee?: string | null;
  note?: string | null;
  /** Bank reference or notification text. */
  description?: string | null;
}

export interface RuleOutcome {
  categoryId: string | null;
  payee: string | null;
  note: string | null;
  labelIds: string[];
  /** The rules that matched, in order. */
  ruleIds: string[];
}

/** Lower case, single spaces – "LIDL  Sofia" and "lidl sofia" are the same. */
export function normalizeRuleText(s: string): string {
  return s.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function textMatches(match: RuleMatch, haystack: string | null | undefined, pattern: string) {
  if (!haystack) return false;
  const h = normalizeRuleText(haystack);
  if (match === 'equals') return h === pattern;
  if (match === 'starts') return h.startsWith(pattern);
  return h.includes(pattern);
}

export function ruleMatches(
  rule: Pick<Rule, 'enabled' | 'field' | 'match' | 'pattern' | 'recordType' | 'accountId'>,
  s: RuleSubject,
): boolean {
  if (!rule.enabled || s.type === 'transfer') return false;
  if (rule.recordType && rule.recordType !== s.type) return false;
  if (rule.accountId && s.accountId && rule.accountId !== s.accountId) return false;
  const pattern = normalizeRuleText(rule.pattern);
  if (!pattern) return false;
  const texts =
    rule.field === 'payee'
      ? [s.payee]
      : rule.field === 'note'
        ? [s.note]
        : [s.payee, s.note, s.description];
  return texts.some((t) => textMatches(rule.match, t, pattern));
}

/**
 * Applies all matching rules in their order: the first rule that sets the category, payee or
 * note wins; labels add up. Values already present (category, note) are kept.
 */
export function applyRules(
  rules: Rule[],
  s: RuleSubject & { categoryId?: string | null },
  /** Kind of a category – categories of the other kind (income vs. expense) are skipped. */
  kindOf?: (categoryId: string) => 'expense' | 'income' | undefined,
): RuleOutcome {
  const out: RuleOutcome = {
    categoryId: s.categoryId ?? null,
    payee: s.payee ?? null,
    note: s.note ?? null,
    labelIds: [],
    ruleIds: [],
  };
  let payeeSet = false;
  const sorted = [...rules].sort((a, b) => a.position - b.position);
  for (const rule of sorted) {
    if (!ruleMatches(rule, s)) continue;
    out.ruleIds.push(rule.id);
    if (rule.categoryId && !out.categoryId && (!kindOf || kindOf(rule.categoryId) === s.type)) {
      out.categoryId = rule.categoryId;
    }
    if (rule.setPayee && !payeeSet) {
      out.payee = rule.setPayee;
      payeeSet = true;
    }
    if (rule.setNote && !out.note) out.note = rule.setNote;
    for (const id of rule.labelIds) if (!out.labelIds.includes(id)) out.labelIds.push(id);
  }
  return out;
}
