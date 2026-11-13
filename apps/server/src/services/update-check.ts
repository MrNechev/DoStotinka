import type { UpdateStatus } from '@dostotinka/shared';
import type { Config } from '../config';
import type { Database } from '../db';
import { getSetting, setSetting } from './settings';

interface StoredRelease {
  latest: string;
  url: string | null;
  publishedAt: string | null;
  checkedAt: string;
}

const KEY = 'latestRelease';

/** "1.2.3" → [1, 2, 3]; anything after the numbers (-beta …) is ignored. Null when invalid. */
function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether version `a` is newer than `b`. */
export function isNewer(a: string, b: string): boolean {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) {
    if (x[i]! !== y[i]!) return x[i]! > y[i]!;
  }
  return false;
}

/** Asks GitHub for the latest release and stores it. Returns the stored state. */
export async function checkForUpdate(
  db: Database,
  config: Config,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredRelease> {
  const res = await fetchImpl(config.UPDATE_CHECK_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      // A generic client name – nothing identifies this server.
      'user-agent': 'DoStotinka-update-check',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Update check failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    tag_name?: unknown;
    html_url?: unknown;
    published_at?: unknown;
  };
  const tag = typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : '';
  if (!parseVersion(tag)) throw new Error('Update check: no version in the answer');
  const stored: StoredRelease = {
    latest: tag,
    url:
      typeof body.html_url === 'string' && body.html_url.startsWith('https://')
        ? body.html_url
        : null,
    publishedAt: typeof body.published_at === 'string' ? body.published_at : null,
    checkedAt: new Date().toISOString(),
  };
  await setSetting(db, KEY, stored);
  return stored;
}

export async function updateStatus(db: Database, config: Config): Promise<UpdateStatus> {
  const stored = await getSetting<StoredRelease>(db, KEY);
  return {
    enabled: config.UPDATE_CHECK,
    latest: stored?.latest ?? null,
    url: stored?.url ?? null,
    publishedAt: stored?.publishedAt ?? null,
    checkedAt: stored?.checkedAt ?? null,
    available: !!stored && isNewer(stored.latest, config.version),
  };
}
