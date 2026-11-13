import { randomUUID } from 'node:crypto';
import {
  applyRules,
  convertMinor,
  type ImportResult,
  type importInput,
  type Rule,
} from '@dostotinka/shared';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db';
import { accounts, categories, labels, recordLabels, records, type UserRow } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { ensureRate, getRateMap } from './rates';
import { listRules } from './rules';

type ImportParsed = z.output<typeof importInput>;

const LABEL_COLORS = ['#3B82F6', '#14B8A6', '#F43F5E', '#A855F7', '#F59E0B', '#22C55E', '#64748B'];

/** Imports many records at once (e.g. from a CSV export of another app). */
export async function importRecords(
  db: Database,
  user: UserRow,
  input: ImportParsed,
): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    // ─── Accounts ───
    const accountByKey = new Map<string, { id: string; currency: string }>();
    let accountsCreated = 0;
    const owned = await tx.select().from(accounts).where(eq(accounts.userId, user.id));
    let sortOrder = owned.reduce((m, a) => Math.max(m, a.sortOrder), -1) + 1;
    for (const a of input.accounts) {
      if (a.existingId) {
        const existing = owned.find((o) => o.id === a.existingId);
        if (!existing) throw notFound(`Account for “${a.key}”`);
        accountByKey.set(a.key, { id: existing.id, currency: existing.currency });
      } else if (a.create) {
        const [created] = await tx
          .insert(accounts)
          .values({ userId: user.id, ...a.create, sortOrder: sortOrder++ })
          .returning();
        await ensureRate(tx, user.id, user.baseCurrency, created!.currency);
        accountByKey.set(a.key, { id: created!.id, currency: created!.currency });
        accountsCreated++;
      } else {
        throw badRequest(`Choose an account for “${a.key}”`);
      }
    }

    // ─── Categories (validate ownership) ───
    const categoryIds = [
      ...new Set(input.records.map((r) => r.categoryId).filter((c): c is string => !!c)),
    ];
    if (categoryIds.length) {
      const found = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.userId, user.id), inArray(categories.id, categoryIds)));
      if (found.length !== categoryIds.length) throw notFound('Category');
    }

    // ─── Labels (by name, created when missing) ───
    const labelNames = [...new Set(input.records.flatMap((r) => r.labels ?? []))];
    const labelByName = new Map<string, string>();
    let labelsCreated = 0;
    if (labelNames.length) {
      const existing = await tx.select().from(labels).where(eq(labels.userId, user.id));
      for (const l of existing) labelByName.set(l.name.toLowerCase(), l.id);
      for (const name of labelNames) {
        if (labelByName.has(name.toLowerCase())) continue;
        const [created] = await tx
          .insert(labels)
          .values({
            userId: user.id,
            name,
            color: LABEL_COLORS[labelsCreated % LABEL_COLORS.length]!,
          })
          .returning();
        labelByName.set(name.toLowerCase(), created!.id);
        labelsCreated++;
      }
    }

    // ─── Rules ───
    let rules: Rule[] = [];
    const kinds = new Map<string, 'expense' | 'income'>();
    const labelExists = new Set<string>();
    if (input.applyRules) {
      rules = await listRules(tx, user.id);
      if (rules.length) {
        for (const c of await tx
          .select({ id: categories.id, kind: categories.kind })
          .from(categories)
          .where(eq(categories.userId, user.id)))
          kinds.set(c.id, c.kind);
        for (const l of await tx
          .select({ id: labels.id })
          .from(labels)
          .where(eq(labels.userId, user.id)))
          labelExists.add(l.id);
      }
    }

    // ─── Duplicate detection ───
    // How many identical records (same account, time and amount) already exist. Each one
    // "absorbs" one row of the file, so genuine repeats inside the file are still imported.
    const existingCount = new Map<string, number>();
    const isDuplicate = (key: string) => {
      const n = existingCount.get(key) ?? 0;
      if (n <= 0) return false;
      existingCount.set(key, n - 1);
      return true;
    };
    if (input.skipDuplicates) {
      const times = input.records.map((r) => new Date(r.occurredAt).getTime());
      const accountIds = [...new Set([...accountByKey.values()].map((a) => a.id))];
      const existing = await tx
        .select({
          accountId: records.accountId,
          occurredAt: records.occurredAt,
          amount: records.amount,
        })
        .from(records)
        .where(
          and(
            eq(records.userId, user.id),
            inArray(records.accountId, accountIds),
            gte(records.occurredAt, new Date(Math.min(...times))),
            lte(records.occurredAt, new Date(Math.max(...times))),
          ),
        );
      for (const e of existing) {
        const key = `${e.accountId}|${e.occurredAt.getTime()}|${e.amount}`;
        existingCount.set(key, (existingCount.get(key) ?? 0) + 1);
      }
    }

    let rateCache: Awaited<ReturnType<typeof getRateMap>> | null = null;
    const rates = async () => {
      rateCache ??= await getRateMap(tx, user.id, user.baseCurrency);
      return rateCache;
    };

    // ─── Records ───
    type Row = typeof records.$inferInsert;
    const rows: Row[] = [];
    const links: { recordId: string; labelId: string }[] = [];
    let skipped = 0;
    for (const r of input.records) {
      const account = accountByKey.get(r.accountKey);
      if (!account) throw badRequest(`Unknown account “${r.accountKey}”`);
      const occurredAt = new Date(r.occurredAt);
      const labelIds = [
        ...new Set((r.labels ?? []).map((n) => labelByName.get(n.toLowerCase())!).filter(Boolean)),
      ];
      const base = { userId: user.id, occurredAt, note: r.note ?? null, payee: r.payee ?? null };
      if (r.type === 'transfer') {
        const target = r.toAccountKey ? accountByKey.get(r.toAccountKey) : undefined;
        if (!target || target.id === account.id)
          throw badRequest('A transfer needs two different accounts');
        if (isDuplicate(`${account.id}|${occurredAt.getTime()}|${-r.amount}`)) {
          skipped++;
          continue;
        }
        // Without an explicit received amount, convert between the account currencies.
        const toAmount =
          r.toAmount ??
          (target.currency === account.currency
            ? r.amount
            : convertMinor(r.amount, account.currency, target.currency, await rates()));
        const group = randomUUID();
        const outId = randomUUID();
        const inId = randomUUID();
        rows.push(
          {
            ...base,
            id: outId,
            accountId: account.id,
            type: 'transfer',
            amount: -r.amount,
            currency: account.currency,
            transferGroupId: group,
            counterpartAccountId: target.id,
          },
          {
            ...base,
            id: inId,
            accountId: target.id,
            type: 'transfer',
            amount: toAmount,
            currency: target.currency,
            transferGroupId: group,
            counterpartAccountId: account.id,
          },
        );
        for (const labelId of labelIds)
          links.push({ recordId: outId, labelId }, { recordId: inId, labelId });
      } else {
        const amount = r.type === 'expense' ? -r.amount : r.amount;
        if (isDuplicate(`${account.id}|${occurredAt.getTime()}|${amount}`)) {
          skipped++;
          continue;
        }
        const id = randomUUID();
        const ruled = rules.length
          ? applyRules(
              rules,
              {
                type: r.type,
                accountId: account.id,
                payee: base.payee,
                note: base.note,
                categoryId: r.categoryId,
              },
              (c) => kinds.get(c),
            )
          : null;
        rows.push({
          ...base,
          ...(ruled ? { payee: ruled.payee?.slice(0, 120) ?? null, note: ruled.note } : {}),
          id,
          accountId: account.id,
          type: r.type,
          amount,
          currency: account.currency,
          categoryId: ruled ? ruled.categoryId : (r.categoryId ?? null),
        });
        const allLabels = new Set([
          ...labelIds,
          ...(ruled?.labelIds.filter((l) => labelExists.has(l)) ?? []),
        ]);
        for (const labelId of allLabels) links.push({ recordId: id, labelId });
      }
    }
    for (let i = 0; i < rows.length; i += 1000)
      await tx.insert(records).values(rows.slice(i, i + 1000));
    for (let i = 0; i < links.length; i += 2000)
      await tx.insert(recordLabels).values(links.slice(i, i + 2000));

    const imported = input.records.length - skipped;
    return { imported, skipped, accountsCreated, labelsCreated };
  });
}
