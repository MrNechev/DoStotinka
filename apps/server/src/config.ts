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
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_USERNAME: z.string().default('slavotax'),
  DB_PASSWORD: z.string().default('slavotax'),
  DB_DATABASE_NAME: z.string().default('slavotax'),

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
  DEMO_EMAIL: z.string().default('demo@slavotax.app'),
  DEMO_PASSWORD: z.string().default('demo1234'),
  /** Regenerate the demo data every N hours (0 = only at startup when missing). */
  DEMO_RESET_HOURS: z.coerce.number().min(0).default(24),

  /** Fetch daily reference rates from the European Central Bank. */
  EXCHANGE_RATES_AUTO_UPDATE: bool(true),
  EXCHANGE_RATES_URL: z
    .string()
    .default('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'),

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
  return { ...c, databaseUrl, version: process.env.APP_VERSION ?? '0.1.0' };
}
