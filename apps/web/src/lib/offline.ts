import type { RecordInput, User } from '@dostotinka/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError, api } from '@/api/client';

/**
 * Offline entry: the lists the record editor needs are kept on this device, and new records that
 * cannot reach the server wait here until it is reachable again. Works over plain http (no
 * service worker needed). Everything is removed on logout.
 */

const CACHE_KEY = 'dostotinka-offline-cache-v1';
const QUEUE_KEY = 'dostotinka-pending-records-v1';
const CHANGED = 'dostotinka-pending-changed';

/** A random UUID – also where `crypto.randomUUID` is missing (plain http). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The server could not be reached (no connection, proxy without backend …). */
export function isOffline(err: unknown): boolean {
  if (err instanceof ApiError)
    return err.status === 502 || err.status === 503 || err.status === 504;
  return err instanceof TypeError || (err instanceof Error && err.name === 'TypeError');
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked – offline entry just does not work then */
  }
};

// ───────────────────────────── Cached lists ─────────────────────────────

/** Queries the record editor needs; kept on the device (first key part). */
const KEPT = new Set([
  'me',
  'config',
  'accounts',
  'categories',
  'labels',
  'templates',
  'currencies',
  'rules',
]);
const KEPT_RECORD_LISTS = new Set(['suggestions', 'payees', 'notes']);

function isKept(key: QueryKey): boolean {
  const [first, second] = key as unknown[];
  if (typeof first !== 'string') return false;
  if (first === 'records') return typeof second === 'string' && KEPT_RECORD_LISTS.has(second);
  return KEPT.has(first) && key.length <= 2;
}

interface CacheEntry {
  key: QueryKey;
  data: unknown;
}

/** The user saved with the lists – used when the server cannot be reached at start. */
export function cachedUser(): User | null {
  const entries = read<{ user: string; entries: CacheEntry[] } | null>(CACHE_KEY, null);
  const me = entries?.entries.find((e) => (e.key as unknown[])[0] === 'me');
  return (me?.data as User | undefined) ?? null;
}

/**
 * Fills the query cache with the saved lists (as stale data: they are fetched again as soon as
 * possible) and keeps saving them while the app runs.
 */
export function keepListsOffline(qc: QueryClient): () => void {
  const saved = read<{ user: string; entries: CacheEntry[] } | null>(CACHE_KEY, null);
  if (saved) {
    for (const e of saved.entries) {
      if ((e.key as unknown[])[0] === 'me') continue;
      if (qc.getQueryData(e.key) === undefined) qc.setQueryData(e.key, e.data, { updatedAt: 1 });
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    const me = qc.getQueryData<User | null>(['me']);
    if (!me) return;
    const entries: CacheEntry[] = qc
      .getQueryCache()
      .getAll()
      .filter(
        (q) => q.state.status === 'success' && q.state.data !== undefined && isKept(q.queryKey),
      )
      .map((q) => ({ key: q.queryKey, data: q.state.data }));
    write(CACHE_KEY, { user: me.id, entries });
  };
  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || !isKept(event.query.queryKey)) return;
    clearTimeout(timer);
    timer = setTimeout(save, 1000);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

// ───────────────────────────── Records waiting to be sent ─────────────────────────────

export interface PendingRecord {
  /** Also the id of the record on the server. */
  id: string;
  userId: string;
  input: RecordInput;
  createdAt: string;
  /** The server refused it (e.g. the account was deleted meanwhile). */
  error?: string;
}

const pending = () => read<PendingRecord[]>(QUEUE_KEY, []);
const savePending = (list: PendingRecord[]) => {
  write(QUEUE_KEY, list);
  window.dispatchEvent(new Event(CHANGED));
};

export function queueRecord(userId: string, input: RecordInput & { clientId: string }) {
  savePending([
    ...pending().filter((p) => p.id !== input.clientId),
    { id: input.clientId, userId, input, createdAt: new Date().toISOString() },
  ]);
}

export function discardPending(id: string) {
  savePending(pending().filter((p) => p.id !== id));
}

let snapshot: PendingRecord[] = pending();
let snapshotRaw = '';
function subscribe(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener(CHANGED, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGED, handler);
    window.removeEventListener('storage', handler);
  };
}
function getSnapshot(): PendingRecord[] {
  let raw = '';
  try {
    raw = localStorage.getItem(QUEUE_KEY) ?? '';
  } catch {
    /* blocked */
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshot = pending();
  }
  return snapshot;
}

/** Records of `userId` saved on this device and not sent yet. */
export function usePendingRecords(userId: string): PendingRecord[] {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  return all.filter((p) => p.userId === userId);
}

let flushing: Promise<number> | null = null;

/** Sends the waiting records of `userId`. Returns how many were saved on the server. */
export function sendPending(userId: string): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (const p of pending().filter((x) => x.userId === userId && !x.error)) {
        try {
          await api('/records', { method: 'POST', body: { ...p.input, clientId: p.id } });
          discardPending(p.id);
          sent++;
        } catch (err) {
          if (isOffline(err)) break;
          if (err instanceof ApiError && err.status === 401) break;
          savePending(
            pending().map((x) =>
              x.id === p.id ? { ...x, error: err instanceof Error ? err.message : String(err) } : x,
            ),
          );
        }
      }
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}

/**
 * Removes the saved lists (logout). Records waiting to be sent stay – they are sent when the same
 * user logs in again.
 */
export function clearOfflineData() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* blocked */
  }
}
