import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return def;
      return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8742),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_USERNAME: z.string().default('dostotinka'),
  DB_PASSWORD: z.string().default('dostotinka'),
  DB_DATABASE_NAME: z.string().default('dostotinka'),

  /** Directory containing the built web app (index.html). Empty = API only. */
  WEB_DIST: z.string().optional(),

  ALLOW_REGISTRATION: bool(true),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** `auto` = secure cookies when the request arrived over HTTPS. */
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v): boolean | number | string => {
      if (!v || v === 'false') return false;
      if (v === 'true') return true;
      const n = Number(v);
      return Number.isInteger(n) ? n : v;
    }),

  DEMO_ENABLED: bool(true),
  DEMO_EMAIL: z.string().default('demo@dostotinka.app'),
  DEMO_PASSWORD: z.string().default('demo1234'),
  /** Regenerate the demo data every N hours (0 = only at startup when missing). */
  DEMO_RESET_HOURS: z.coerce.number().min(0).default(24),

  /** Fetch daily reference rates from the European Central Bank. */
  EXCHANGE_RATES_AUTO_UPDATE: bool(true),
  EXCHANGE_RATES_URL: z
    .string()
    .default('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'),

  /** Allow users to send planned-payment reminders to a URL of their choice (ntfy, Gotify …). */
  NOTIFICATIONS_ENABLED: bool(true),

  /** Public address of the app (e.g. https://money.example.com), used for SSO redirects. */
  PUBLIC_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),

  /** Single sign-on with an OpenID Connect provider (Authentik, Authelia, Keycloak, Google …). */
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_SCOPE: z.string().default('openid email profile'),
  OIDC_BUTTON_TEXT: z.string().default('Log in with SSO'),
  /** Create a DoStotinka user on the first SSO login (otherwise only existing users may log in). */
  OIDC_AUTO_REGISTER: bool(true),
  /**
   * Link an SSO login to an existing user with the same e-mail address automatically. Only safe
   * when users cannot choose their e-mail freely in DoStotinka or at the provider – off by default;
   * users can always connect SSO in Settings instead.
   */
  OIDC_LINK_BY_EMAIL: bool(false),

  /** Total size of the attached files (receipts) per user in MB; 0 = unlimited. */
  ATTACHMENT_QUOTA_MB: z.coerce.number().min(0).default(1024),

  /**
   * Automatic import of transactions (phone notifications and open banking). Every user still
   * switches it on for themselves; `false` hides the feature on this server.
   */
  AUTOMATIC_IMPORT: bool(true),
  /** Enable Banking API (only changed for tests). */
  ENABLE_BANKING_API_URL: z.string().url().default('https://api.enablebanking.com'),
  /**
   * Key used to encrypt stored bank access keys. Any long random string; keep it when moving the
   * server. Without it a key is generated and stored in the database.
   */
  ENCRYPTION_KEY: z
    .string()
    .min(16)
    .optional()
    .or(z.literal('').transform(() => undefined)),

  /** Expose interactive API documentation at /api/docs. */
  API_DOCS: bool(true),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(20),
});

export type Config = z.infer<typeof envSchema> & { databaseUrl: string; version: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  const c = parsed.data;
  const databaseUrl =
    c.DATABASE_URL ??
    `postgres://${encodeURIComponent(c.DB_USERNAME)}:${encodeURIComponent(c.DB_PASSWORD)}@${c.DB_HOST}:${c.DB_PORT}/${encodeURIComponent(c.DB_DATABASE_NAME)}`;
  return { ...c, databaseUrl, version: process.env.APP_VERSION ?? '0.7.0' };
}
