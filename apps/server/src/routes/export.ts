import { currencyDecimals, recordListQuery } from '@dostotinka/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  accounts,
  budgets,
  categories,
  debts,
  exchangeRates,
  goals,
  holdings,
  labels,
  plannedPayments,
  recordLabels,
  records,
  recordTemplates,
  rules,
} from '../db/schema';
import { safeTimeZone } from '../lib/dates';
import { currentUser } from '../plugins/auth';
import { toUser } from '../services/dto';
import { filterConditions } from '../services/records';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Prevent CSV/formula injection when opened in spreadsheet software.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function localDateTime(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export const exportRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/records.csv',
    {
      schema: {
        tags: ['export'],
        summary: 'Export records as CSV',
        description: 'Accepts the same filters as `GET /api/records` (without pagination).',
        querystring: recordListQuery.omit({ limit: true, cursor: true }).extend({
          tz: z.string().max(64).optional(),
        }),
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      const tz = safeTimeZone(req.query.tz, user.timezone);
      const { tz: _tz, ...filters } = req.query;
      const conditions = await filterConditions(db, user.id, filters);

      const [rows, accountRows, categoryRows, labelRows, recordLabelRows] = await Promise.all([
        db
          .select()
          .from(records)
          .where(and(...conditions))
          .orderBy(asc(records.occurredAt)),
        db.select().from(accounts).where(eq(accounts.userId, user.id)),
        db.select().from(categories).where(eq(categories.userId, user.id)),
        db.select().from(labels).where(eq(labels.userId, user.id)),
        db
          .select({ recordId: recordLabels.recordId, labelId: recordLabels.labelId })
          .from(recordLabels)
          .innerJoin(labels, eq(labels.id, recordLabels.labelId))
          .where(eq(labels.userId, user.id)),
      ]);
      const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
      const cat = new Map(categoryRows.map((c) => [c.id, c]));
      const labelName = new Map(labelRows.map((l) => [l.id, l.name]));
      const labelsOf = new Map<string, string[]>();
      for (const rl of recordLabelRows) {
        const list = labelsOf.get(rl.recordId) ?? [];
        list.push(labelName.get(rl.labelId) ?? '');
        labelsOf.set(rl.recordId, list);
      }

      const header = [
        'Date',
        'Account',
        'Type',
        'Category',
        'Subcategory',
        'Amount',
        'Currency',
        'Note',
        'Payee',
        'Labels',
        'Transfer account',
      ];
      const lines = [header.join(',')];
      for (const r of rows) {
        const c = r.categoryId ? cat.get(r.categoryId) : undefined;
        const parent = c?.parentId ? cat.get(c.parentId) : undefined;
        const amount = (r.amount / 10 ** currencyDecimals(r.currency)).toFixed(
          currencyDecimals(r.currency),
        );
        lines.push(
          [
            localDateTime(r.occurredAt, tz),
            accountName.get(r.accountId),
            r.type,
            parent ? parent.name : (c?.name ?? ''),
            parent ? c?.name : '',
            amount,
            r.currency,
            r.note,
            r.payee,
            (labelsOf.get(r.id) ?? []).join('; '),
            r.counterpartAccountId ? accountName.get(r.counterpartAccountId) : '',
          ]
            .map(csvEscape)
            .join(','),
        );
      }
      const stamp = new Date().toISOString().slice(0, 10);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="dostotinka-records-${stamp}.csv"`)
        .send(`﻿${lines.join('\r\n')}\r\n`);
    },
  );

  app.get(
    '/backup.json',
    { schema: { tags: ['export'], summary: 'Full JSON backup of your data' } },
    async (req, reply) => {
      const user = currentUser(req);
      const [
        accountRows,
        categoryRows,
        labelRows,
        recordRows,
        recordLabelRows,
        plannedRows,
        budgetRows,
        rateRows,
        goalRows,
        templateRows,
        debtRows,
        ruleRows,
        holdingRows,
      ] = await Promise.all([
        db.select().from(accounts).where(eq(accounts.userId, user.id)),
        db.select().from(categories).where(eq(categories.userId, user.id)),
        db.select().from(labels).where(eq(labels.userId, user.id)),
        db
          .select()
          .from(records)
          .where(eq(records.userId, user.id))
          .orderBy(asc(records.occurredAt)),
        db
          .select({ recordId: recordLabels.recordId, labelId: recordLabels.labelId })
          .from(recordLabels)
          .innerJoin(labels, eq(labels.id, recordLabels.labelId))
          .where(eq(labels.userId, user.id)),
        db.select().from(plannedPayments).where(eq(plannedPayments.userId, user.id)),
        db.select().from(budgets).where(eq(budgets.userId, user.id)),
        db.select().from(exchangeRates).where(eq(exchangeRates.userId, user.id)),
        db.select().from(goals).where(eq(goals.userId, user.id)),
        db.select().from(recordTemplates).where(eq(recordTemplates.userId, user.id)),
        db.select().from(debts).where(eq(debts.userId, user.id)),
        db.select().from(rules).where(eq(rules.userId, user.id)).orderBy(asc(rules.position)),
        db.select().from(holdings).where(eq(holdings.userId, user.id)),
      ]);
      const strip = <T extends { userId?: string }>(rows: T[]) =>
        rows.map(({ userId: _u, ...rest }) => rest);
      const backup = {
        format: 'dostotinka-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: app.config.version,
        user: toUser(user),
        accounts: strip(accountRows),
        categories: strip(categoryRows),
        labels: strip(labelRows),
        records: strip(recordRows),
        recordLabels: recordLabelRows,
        plannedPayments: strip(plannedRows),
        budgets: strip(budgetRows),
        exchangeRates: strip(rateRows),
        goals: strip(goalRows),
        templates: strip(templateRows),
        debts: strip(debtRows),
        rules: strip(ruleRows),
        holdings: strip(holdingRows),
      };
      const stamp = new Date().toISOString().slice(0, 10);
      return reply
        .header('content-type', 'application/json; charset=utf-8')
        .header('content-disposition', `attachment; filename="dostotinka-backup-${stamp}.json"`)
        .send(JSON.stringify(backup, null, 2));
    },
  );
};
