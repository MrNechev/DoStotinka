import {
  type ApplyRuleResult,
  applyRules,
  normalizeRuleText,
  type PayeeUsage,
  type Rule,
  type RuleField,
  type RuleMatch,
  type RuleSubject,
  type ruleInput,
  ruleMatches,
} from '@dostotinka/shared';
import { and, asc, desc, eq, inArray, isNotNull, ne, or, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db';
import {
  accounts,
  categories,
  inboxItems,
  labels,
  plannedPayments,
  type RuleRow,
  recordLabels,
  records,
  recordTemplates,
  rules,
} from '../db/schema';
import { badRequest, notFound } from '../lib/errors';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;
type Input = z.output<typeof ruleInput>;

const MAX_RULES = 500;

export function toRule(r: RuleRow): Rule {
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    position: r.position,
    field: r.field as RuleField,
    match: r.match as RuleMatch,
    pattern: r.pattern,
    recordType: r.recordType === 'expense' || r.recordType === 'income' ? r.recordType : null,
    accountId: r.accountId,
    categoryId: r.categoryId,
    setPayee: r.setPayee,
    setNote: r.setNote,
    labelIds: r.labelIds,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listRules(db: Tx, userId: string): Promise<Rule[]> {
  const rows = await db
    .select()
    .from(rules)
    .where(eq(rules.userId, userId))
    .orderBy(asc(rules.position), asc(rules.createdAt));
  return rows.map(toRule);
}

/** Checks that the referenced account, category and labels belong to the user. */
async function checkReferences(db: Database, userId: string, input: Input) {
  if (input.accountId) {
    const [a] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.id, input.accountId)));
    if (!a) throw badRequest('Unknown account');
  }
  if (input.categoryId) {
    const [c] = await db
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, input.categoryId)));
    if (!c) throw badRequest('Unknown category');
    if (input.recordType && c.kind !== input.recordType) {
      throw badRequest('The category does not fit the type of the rule');
    }
  }
  const labelIds = [...new Set(input.labelIds)];
  if (labelIds.length) {
    const owned = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.userId, userId), inArray(labels.id, labelIds)));
    if (owned.length !== labelIds.length) throw badRequest('Unknown label');
  }
  return { ...input, labelIds };
}

export async function createRule(db: Database, userId: string, input: Input): Promise<Rule> {
  const values = await checkReferences(db, userId, input);
  const [{ n, max } = { n: 0, max: 0 }] = await db
    .select({
      n: sql<number>`count(*)::int`,
      max: sql<number>`coalesce(max(${rules.position}), 0)::int`,
    })
    .from(rules)
    .where(eq(rules.userId, userId));
  if (n >= MAX_RULES) throw badRequest(`You can have at most ${MAX_RULES} rules`);
  const [row] = await db
    .insert(rules)
    .values({ ...values, userId, position: max + 1 })
    .returning();
  return toRule(row!);
}

export async function updateRule(
  db: Database,
  userId: string,
  id: string,
  input: Input,
): Promise<Rule> {
  const values = await checkReferences(db, userId, input);
  const [row] = await db
    .update(rules)
    .set(values)
    .where(and(eq(rules.id, id), eq(rules.userId, userId)))
    .returning();
  if (!row) throw notFound('Rule');
  return toRule(row);
}

export async function deleteRule(db: Database, userId: string, id: string): Promise<void> {
  const rows = await db
    .delete(rules)
    .where(and(eq(rules.id, id), eq(rules.userId, userId)))
    .returning({ id: rules.id });
  if (!rows.length) throw notFound('Rule');
}

/** Saves a new order (rules earlier in the list win). */
export async function reorderRules(db: Database, userId: string, ids: string[]): Promise<Rule[]> {
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx
        .update(rules)
        .set({ position: i + 1 })
        .where(and(eq(rules.id, id), eq(rules.userId, userId)));
    }
  });
  return listRules(db, userId);
}

/** What the rules make of an imported transaction (null when no rule matched). */
export async function ruleOutcome(db: Tx, userId: string, subject: RuleSubject) {
  const all = await listRules(db, userId);
  if (!all.length) return null;
  const categoryIds = [...new Set(all.map((r) => r.categoryId).filter((c): c is string => !!c))];
  const kinds = new Map(
    categoryIds.length
      ? (
          await db
            .select({ id: categories.id, kind: categories.kind })
            .from(categories)
            .where(inArray(categories.id, categoryIds))
        ).map((c) => [c.id, c.kind] as const)
      : [],
  );
  const out = applyRules(all, subject, (id) => kinds.get(id));
  return out.ruleIds.length ? out : null;
}

/** Narrows the records a rule can match with SQL before the exact check in JS. */
function candidateFilter(rule: Rule): SQL {
  const pattern = normalizeRuleText(rule.pattern).replace(/[\\%_]/g, (m) => `\\${m}`);
  // Spaces in the pattern match any whitespace (the text is normalised in the exact check).
  const like = `%${pattern.split(' ').join('%')}%`;
  const columns =
    rule.field === 'payee'
      ? [records.payee]
      : rule.field === 'note'
        ? [records.note]
        : [records.payee, records.note];
  return or(...columns.map((c) => sql`${c} ilike ${like}`))!;
}

/**
 * Runs one rule over the existing records (expenses and income): sets the category (only where
 * none is set, unless `overwriteCategory`), renames the payee, fills empty notes, adds labels.
 */
export async function applyRuleToHistory(
  db: Database,
  userId: string,
  id: string,
  opts: { dryRun: boolean; overwriteCategory: boolean },
): Promise<ApplyRuleResult> {
  const [row] = await db
    .select()
    .from(rules)
    .where(and(eq(rules.id, id), eq(rules.userId, userId)));
  if (!row) throw notFound('Rule');
  const rule = { ...toRule(row), enabled: true };
  const candidates = await db
    .select({
      id: records.id,
      type: records.type,
      accountId: records.accountId,
      categoryId: records.categoryId,
      payee: records.payee,
      note: records.note,
    })
    .from(records)
    .where(and(eq(records.userId, userId), ne(records.type, 'transfer'), candidateFilter(rule)));
  const matched = candidates.filter((r) => ruleMatches(rule, r));
  if (!matched.length) return { matched: 0, changed: 0 };

  const existingLabels = rule.labelIds.length
    ? await db
        .select({ recordId: recordLabels.recordId, labelId: recordLabels.labelId })
        .from(recordLabels)
        .where(
          and(
            inArray(
              recordLabels.recordId,
              matched.map((r) => r.id),
            ),
            inArray(recordLabels.labelId, rule.labelIds),
          ),
        )
    : [];
  const hasLabel = new Set(existingLabels.map((l) => `${l.recordId}|${l.labelId}`));

  // A category only fits records of its kind (expense / income).
  const [category] = rule.categoryId
    ? await db
        .select({ kind: categories.kind })
        .from(categories)
        .where(eq(categories.id, rule.categoryId))
    : [];

  let changed = 0;
  const work: { id: string; set: Record<string, unknown>; labels: string[] }[] = [];
  for (const r of matched) {
    const set: Record<string, unknown> = {};
    if (
      rule.categoryId &&
      category?.kind === r.type &&
      r.categoryId !== rule.categoryId &&
      (!r.categoryId || opts.overwriteCategory)
    ) {
      set.categoryId = rule.categoryId;
    }
    if (rule.setPayee && r.payee !== rule.setPayee) set.payee = rule.setPayee;
    if (rule.setNote && !r.note?.trim()) set.note = rule.setNote;
    const newLabels = rule.labelIds.filter((l) => !hasLabel.has(`${r.id}|${l}`));
    if (Object.keys(set).length || newLabels.length) {
      changed++;
      work.push({ id: r.id, set, labels: newLabels });
    }
  }
  if (opts.dryRun || !work.length) return { matched: matched.length, changed };

  await db.transaction(async (tx) => {
    for (const w of work) {
      if (Object.keys(w.set).length) {
        await tx
          .update(records)
          .set(w.set)
          .where(and(eq(records.id, w.id), eq(records.userId, userId)));
      }
      if (w.labels.length) {
        await tx
          .insert(recordLabels)
          .values(w.labels.map((labelId) => ({ recordId: w.id, labelId })))
          .onConflictDoNothing();
      }
    }
  });
  return { matched: matched.length, changed };
}

// ───────────────────────────── Payees ─────────────────────────────

/** All payees with how often and when they were last used. */
export async function listPayeeUsage(db: Database, userId: string): Promise<PayeeUsage[]> {
  const rows = await db
    .select({
      payee: records.payee,
      count: sql<number>`count(*)::int`,
      lastUsed: sql<string>`max(${records.occurredAt})`,
    })
    .from(records)
    .where(and(eq(records.userId, userId), isNotNull(records.payee), ne(records.payee, '')))
    .groupBy(records.payee)
    .orderBy(desc(sql`count(*)`), asc(records.payee))
    .limit(5000);
  return rows.map((r) => ({
    payee: r.payee!,
    count: r.count,
    lastUsed: new Date(r.lastUsed).toISOString(),
  }));
}

/** Renames a payee everywhere – renaming to an existing payee merges the two. */
export async function renamePayee(
  db: Database,
  userId: string,
  from: string,
  to: string,
): Promise<{ changed: number }> {
  if (from === to) return { changed: 0 };
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(records)
      .set({ payee: to })
      .where(and(eq(records.userId, userId), eq(records.payee, from)))
      .returning({ id: records.id });
    await tx
      .update(recordTemplates)
      .set({ payee: to })
      .where(and(eq(recordTemplates.userId, userId), eq(recordTemplates.payee, from)));
    await tx
      .update(plannedPayments)
      .set({ payee: to })
      .where(and(eq(plannedPayments.userId, userId), eq(plannedPayments.payee, from)));
    await tx
      .update(inboxItems)
      .set({ payee: to })
      .where(
        and(
          eq(inboxItems.userId, userId),
          eq(inboxItems.payee, from),
          eq(inboxItems.status, 'pending'),
        ),
      );
    return { changed: changed.length };
  });
}
