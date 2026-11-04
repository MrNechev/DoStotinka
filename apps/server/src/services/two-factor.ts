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

/**
 * Checks a login code: a TOTP code from the authenticator app or one of the recovery codes.
 * Both are single use – the update only succeeds if nobody used the code in the meantime.
 */
export async function verifySecondFactor(db: Database, user: UserRow, code: string | undefined) {
  if (!user.totpSecret) return;
  if (!code) throw codeRequired();

  const step = verifyTotp(user.totpSecret, code, { lastUsedStep: user.totpLastStep });
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
