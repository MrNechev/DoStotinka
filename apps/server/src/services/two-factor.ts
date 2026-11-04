import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../db';
import { type UserRow, users } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { HttpError } from '../lib/errors';
import { normalizeRecoveryCode, verifyTotp } from '../lib/totp';

/** 401 that tells clients to ask for the authenticator code (`issues[0].path === 'code'`). */
export const codeRequired = () =>
  new HttpError(401, 'Enter the code from your authenticator app', [
    { path: 'code', message: 'required' },
  ]);
const codeInvalid = () =>
  new HttpError(401, 'The code is not valid', [{ path: 'code', message: 'invalid' }]);

/** Wrong codes per user: after MAX_FAILURES the account is locked for LOCK_MS (per process). */
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const failures = new Map<string, { count: number; since: number }>();

function assertNotLocked(userId: string) {
  const entry = failures.get(userId);
  if (!entry) return;
  if (Date.now() - entry.since > LOCK_MS) {
    failures.delete(userId);
    return;
  }
  if (entry.count >= MAX_FAILURES) {
    throw new HttpError(429, 'Too many wrong codes. Try again in 15 minutes.', [
      { path: 'code', message: 'locked' },
    ]);
  }
}

function recordFailure(userId: string) {
  const entry = failures.get(userId);
  if (entry && Date.now() - entry.since <= LOCK_MS) entry.count++;
  else failures.set(userId, { count: 1, since: Date.now() });
}

/**
 * Checks a login code: a TOTP code from the authenticator app or one of the recovery codes.
 * Both are single use – the update only succeeds if nobody used the code in the meantime.
 * Repeated wrong codes lock the account for a while (guessing 6 digits must not be feasible).
 */
export async function verifySecondFactor(db: Database, user: UserRow, code: string | undefined) {
  if (!user.totpSecret) return;
  if (!code) throw codeRequired();
  assertNotLocked(user.id);
  try {
    await checkCode(db, user, code);
    failures.delete(user.id);
  } catch (err) {
    recordFailure(user.id);
    throw err;
  }
}

async function checkCode(db: Database, user: UserRow, code: string) {
  const step = verifyTotp(user.totpSecret!, code, { lastUsedStep: user.totpLastStep });
  if (step !== null) {
    const updated = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(
        and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))),
      )
      .returning({ id: users.id });
    if (updated.length) return;
    throw codeInvalid();
  }

  const hash = sha256(normalizeRecoveryCode(code));
  const consumed = await db
    .update(users)
    .set({ recoveryCodes: sql`${users.recoveryCodes} - ${hash}::text` })
    .where(and(eq(users.id, user.id), sql`${users.recoveryCodes} ? ${hash}::text`))
    .returning({ id: users.id });
  if (!consumed.length) throw codeInvalid();
}
