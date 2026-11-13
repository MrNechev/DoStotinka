import { createHash, createPrivateKey, type KeyObject, sign } from 'node:crypto';

/**
 * Minimal client of the Enable Banking API (https://enablebanking.com/docs/api/reference/),
 * account information only. Every user brings their own application (id + RSA key); requests are
 * authenticated with a short-lived RS256 JWT signed by that key.
 */

export interface EbCredentials {
  applicationId: string;
  privateKey: KeyObject;
}

export class EnableBankingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Enable Banking error code, e.g. EXPIRED_SESSION. */
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'EnableBankingError';
  }

  /** The consent is gone – the user has to connect the bank again. */
  get sessionEnded() {
    return (
      ['EXPIRED_SESSION', 'CLOSED_SESSION', 'REVOKED_SESSION', 'SESSION_DOES_NOT_EXIST'].includes(
        this.code ?? '',
      ) ||
      (this.status === 401 && !this.code)
    );
  }

  get rateLimited() {
    return this.status === 429 || this.code === 'ASPSP_RATE_LIMIT_EXCEEDED';
  }
}

export function loadPrivateKey(pem: string): KeyObject {
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not RSA');
    return key;
  } catch {
    throw new Error('The private key could not be read. Upload the .pem file of the application.');
  }
}

const b64url = (value: object | Buffer) =>
  (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url');

export function makeJwt(creds: EbCredentials, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url({ typ: 'JWT', alg: 'RS256', kid: creds.applicationId });
  const payload = b64url({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat,
    exp: iat + 3600,
  });
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), creds.privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}

// ───────────────────────────── API shapes (only the fields we use) ─────────────────────────────

export interface EbApplication {
  name: string;
  kid: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  redirect_urls: string[];
  active: boolean;
  countries: string[];
}

export interface EbAspsp {
  name: string;
  country: string;
  logo?: string | null;
  psu_types?: string[];
  maximum_consent_validity?: number | null;
  beta?: boolean;
}

export interface EbAccount {
  uid?: string | null;
  account_id?: { iban?: string | null; other?: { identification?: string | null } | null } | null;
  name?: string | null;
  details?: string | null;
  product?: string | null;
  currency?: string | null;
  identification_hash?: string | null;
}

export interface EbSession {
  session_id: string;
  accounts: EbAccount[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
}

export interface EbAmount {
  amount: string;
  currency: string;
}

export interface EbTransaction {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: EbAmount;
  credit_debit_indicator?: 'CRDT' | 'DBIT' | null;
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  note?: string | null;
}

export interface EbBalance {
  name?: string;
  balance_amount: EbAmount;
  balance_type?: string;
}

// ───────────────────────────── Client ─────────────────────────────

export class EnableBankingClient {
  constructor(
    private readonly baseUrl: string,
    private readonly creds: EbCredentials,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${makeJwt(this.creds)}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new EnableBankingError(
        `Enable Banking could not be reached (${(err as Error).message})`,
        0,
        null,
      );
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const d = (data ?? {}) as { message?: string; error?: string; detail?: unknown };
      const detail = typeof d.detail === 'string' ? ` – ${d.detail}` : '';
      throw new EnableBankingError(
        `${d.message ?? `HTTP ${res.status}`}${detail}`,
        res.status,
        d.error ?? null,
      );
    }
    return data as T;
  }

  application() {
    return this.request<EbApplication>('GET', '/application');
  }

  async aspsps(country: string): Promise<EbAspsp[]> {
    const data = await this.request<{ aspsps?: EbAspsp[] } | EbAspsp[]>(
      'GET',
      `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`,
    );
    return Array.isArray(data) ? data : (data.aspsps ?? []);
  }

  startAuth(input: {
    bankName: string;
    country: string;
    validUntil: Date;
    redirectUrl: string;
    state: string;
    language?: string;
  }) {
    return this.request<{ url: string; authorization_id: string }>('POST', '/auth', {
      access: { valid_until: input.validUntil.toISOString(), balances: true, transactions: true },
      aspsp: { name: input.bankName, country: input.country },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: 'personal',
      ...(input.language ? { language: input.language } : {}),
    });
  }

  createSession(code: string) {
    return this.request<EbSession>('POST', '/sessions', { code });
  }

  async deleteSession(sessionId: string) {
    await this.request('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
  }

  async balances(accountUid: string): Promise<EbBalance[]> {
    const data = await this.request<{ balances?: EbBalance[] }>(
      'GET',
      `/accounts/${encodeURIComponent(accountUid)}/balances`,
    );
    return data.balances ?? [];
  }

  /** All transactions in the window, following continuation keys (bounded). */
  async transactions(accountUid: string, dateFrom: string): Promise<EbTransaction[]> {
    const out: EbTransaction[] = [];
    let key: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 60; page++) {
      const query = new URLSearchParams({ date_from: dateFrom });
      if (key) query.set('continuation_key', key);
      const data: { transactions?: EbTransaction[]; continuation_key?: string | null } =
        await this.request(
          'GET',
          `/accounts/${encodeURIComponent(accountUid)}/transactions?${query}`,
        );
      out.push(...(data.transactions ?? []));
      key = data.continuation_key ?? null;
      if (!key || seen.has(key)) break;
      seen.add(key);
    }
    return out;
  }
}

// ───────────────────────────── Mapping helpers ─────────────────────────────

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Booked date of a transaction (transaction date first – it is the day the card was used). */
export function transactionDate(t: EbTransaction): string | null {
  for (const d of [t.transaction_date, t.booking_date, t.value_date]) {
    if (d && DATE.test(d.slice(0, 10))) return d.slice(0, 10);
  }
  return null;
}

/** Amount as positive decimal string and direction (the bank may or may not sign the amount). */
export function transactionDirection(t: EbTransaction): {
  amount: string;
  type: 'expense' | 'income';
} | null {
  const raw = String(t.transaction_amount?.amount ?? '').trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(raw) || Number(raw) === 0) return null;
  const negative = raw.startsWith('-');
  const amount = raw.replace(/^[+-]/, '');
  const type =
    t.credit_debit_indicator === 'DBIT'
      ? 'expense'
      : t.credit_debit_indicator === 'CRDT'
        ? 'income'
        : negative
          ? 'expense'
          : 'income';
  return { amount, type };
}

/** Removes SEPA field prefixes and noise from remittance lines. */
export function remittanceText(t: EbTransaction): string | null {
  const lines = (t.remittance_information ?? [])
    .map((l) => l?.replace(/\b(EREF|KREF|MREF|CRED|SVWZ|ABWA|ABWE|IBAN|BIC)\+/g, ' ').trim())
    .filter((l): l is string => !!l && !/^NOTPROVIDED$/i.test(l));
  const text = [...lines, t.note ?? ''].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 500) : null;
}

/**
 * Stable id of a transaction. `entry_reference` when the bank sends one; otherwise a hash of the
 * fields that do not change when a payment gets booked (Actual Budget does the same).
 */
export function transactionKey(t: EbTransaction, accountIdentity: string): string {
  if (t.entry_reference) return `ref:${accountIdentity}:${t.entry_reference}`;
  const parts = [
    t.transaction_date ?? t.value_date ?? t.booking_date ?? '',
    t.transaction_amount?.amount,
    t.transaction_amount?.currency,
    t.credit_debit_indicator ?? '',
    t.creditor?.name ?? '',
    t.debtor?.name ?? '',
    (t.remittance_information ?? []).join('|'),
  ];
  return `hash:${accountIdentity}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)}`;
}

/** Preferred balance: booked closing, then interim, then expected, then whatever comes first. */
export function pickBalance(balances: EbBalance[]): EbAmount | null {
  for (const type of ['CLBD', 'ITBD', 'CLAV', 'ITAV', 'XPCD', 'OPBD']) {
    const b = balances.find((x) => x.balance_type === type);
    if (b?.balance_amount) return b.balance_amount;
  }
  return balances[0]?.balance_amount ?? null;
}
