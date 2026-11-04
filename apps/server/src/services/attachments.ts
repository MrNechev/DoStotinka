import type { Attachment } from '@slavotax/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db';
import { type AttachmentRow, attachments, records } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;

/** Largest accepted file (the web app downsizes photos before uploading). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_RECORD = 10;

/** Accepted file types with the bytes every such file starts with. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/gif': (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
};

export const ATTACHMENT_TYPES = Object.keys(SIGNATURES);

export function toAttachment(a: Omit<AttachmentRow, 'data' | 'userId'>): Attachment {
  return {
    id: a.id,
    recordId: a.recordId,
    fileName: a.fileName,
    contentType: a.contentType,
    size: a.size,
    createdAt: a.createdAt.toISOString(),
  };
}

const metaColumns = {
  id: attachments.id,
  recordId: attachments.recordId,
  fileName: attachments.fileName,
  contentType: attachments.contentType,
  size: attachments.size,
  createdAt: attachments.createdAt,
};

/** Cleans a client supplied file name so it is safe to show and to put into a header. */
export function cleanFileName(name: string | undefined, contentType: string): string {
  const cleaned = (name ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\\/"<>|:*?]/gu, '')
    .trim()
    .slice(0, 120);
  if (cleaned) return cleaned;
  const ext = contentType === 'application/pdf' ? 'pdf' : contentType.split('/')[1];
  return `attachment.${ext === 'jpeg' ? 'jpg' : ext}`;
}

/**
 * The record row that owns the attachments of a record. Both rows of a transfer share the
 * attachments of the outgoing side.
 */
async function owningRecordIds(db: Tx, userId: string, recordId: string) {
  const [row] = await db
    .select({ id: records.id, group: records.transferGroupId })
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.userId, userId)));
  if (!row) throw notFound('Record');
  if (!row.group) return { owner: row.id, all: [row.id] };
  const group = await db
    .select({ id: records.id, amount: records.amount })
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.transferGroupId, row.group)));
  const owner = group.find((r) => r.amount < 0) ?? group[0]!;
  return { owner: owner.id, all: group.map((r) => r.id) };
}

export async function listAttachments(
  db: Database,
  userId: string,
  recordId: string,
): Promise<Attachment[]> {
  const { all } = await owningRecordIds(db, userId, recordId);
  const rows = await db
    .select(metaColumns)
    .from(attachments)
    .where(and(eq(attachments.userId, userId), inArray(attachments.recordId, all)))
    .orderBy(attachments.createdAt);
  return rows.map(toAttachment);
}

export async function addAttachment(
  db: Database,
  userId: string,
  recordId: string,
  file: { data: Buffer; contentType: string; fileName?: string },
  quotaBytes = 0,
): Promise<Attachment> {
  const check = SIGNATURES[file.contentType];
  if (!check) throw badRequest('Only images (JPEG, PNG, WebP, GIF) and PDF files can be attached');
  if (!file.data.length) throw badRequest('The file is empty');
  if (file.data.length > MAX_ATTACHMENT_BYTES) throw badRequest('The file is larger than 10 MB');
  if (!check(file.data)) throw badRequest('The file content does not match its type');

  return db.transaction(async (tx) => {
    const { owner, all } = await owningRecordIds(tx, userId, recordId);
    // Serialise uploads to the same record so the limit below holds.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${owner}))`);
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(attachments)
      .where(inArray(attachments.recordId, all));
    if (count >= MAX_ATTACHMENTS_PER_RECORD) {
      throw badRequest(`A record can have at most ${MAX_ATTACHMENTS_PER_RECORD} attachments`);
    }
    if (quotaBytes > 0) {
      const [{ used } = { used: 0 }] = await tx
        .select({
          used: sql<number>`coalesce(sum(${attachments.size}), 0)::bigint`.mapWith(Number),
        })
        .from(attachments)
        .where(eq(attachments.userId, userId));
      if (used + file.data.length > quotaBytes) {
        throw badRequest('Your storage for attached files is full');
      }
    }
    const [row] = await tx
      .insert(attachments)
      .values({
        userId,
        recordId: owner,
        fileName: cleanFileName(file.fileName, file.contentType),
        contentType: file.contentType,
        size: file.data.length,
        data: file.data,
      })
      .returning(metaColumns);
    return toAttachment(row!);
  });
}

export async function getAttachmentFile(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)));
  if (!row) throw notFound('Attachment');
  return row;
}

export async function deleteAttachment(db: Database, userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .returning({ id: attachments.id });
  if (!deleted.length) throw notFound('Attachment');
}

/** Number of attachments per record id (transfers: per row of the group). */
export async function attachmentCounts(db: Tx, recordIds: string[]) {
  const counts = new Map<string, number>();
  if (!recordIds.length) return counts;
  const rows = await db
    .select({ recordId: attachments.recordId, count: sql<number>`count(*)::int` })
    .from(attachments)
    .where(inArray(attachments.recordId, recordIds))
    .groupBy(attachments.recordId);
  for (const r of rows) counts.set(r.recordId, r.count);
  return counts;
}

/** Removes attachments whose record no longer exists. Returns the number of removed files. */
export async function sweepOrphanAttachments(db: Tx, userId?: string): Promise<number> {
  const deleted = await db
    .delete(attachments)
    .where(
      and(
        userId ? eq(attachments.userId, userId) : undefined,
        sql`not exists (select 1 from ${records} where ${records.id} = ${attachments.recordId})`,
      ),
    )
    .returning({ id: attachments.id });
  return deleted.length;
}

/** Total bytes stored per user (for the admin overview). */
export async function storageByUser(db: Database) {
  const rows = await db
    .select({
      userId: attachments.userId,
      bytes: sql<number>`coalesce(sum(${attachments.size}), 0)::bigint`.mapWith(Number),
      count: sql<number>`count(*)::int`,
    })
    .from(attachments)
    .groupBy(attachments.userId);
  return new Map(rows.map((r) => [r.userId, { bytes: r.bytes, count: r.count }]));
}
