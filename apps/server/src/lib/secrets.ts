import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Config } from '../config';
import type { Database } from '../db';
import { getSetting, setSetting } from '../services/settings';

/**
 * Encryption of secrets stored in the database (the private key of a user's Enable Banking
 * application). AES-256-GCM with a key from `ENCRYPTION_KEY`; without it a random key is created
 * once and kept in the database – that still keeps secrets out of logs and JSON backups, but
 * anyone with the database can decrypt them, so production setups should set ENCRYPTION_KEY.
 */
let cachedKey: Buffer | null = null;

export async function encryptionKey(db: Database, config: Config): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  if (config.ENCRYPTION_KEY) {
    cachedKey = createHash('sha256').update(config.ENCRYPTION_KEY).digest();
    return cachedKey;
  }
  let stored = await getSetting<string>(db, 'encryptionKey');
  if (!stored) {
    stored = randomBytes(32).toString('base64');
    await setSetting(db, 'encryptionKey', stored);
  }
  cachedKey = Buffer.from(stored, 'base64');
  return cachedKey;
}

/** Test helper: forget the cached key. */
export function resetEncryptionKey() {
  cachedKey = null;
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join(':');
}

export function decrypt(sealed: string, key: Buffer): string {
  const [version, iv, tag, data] = sealed.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
