import type { Config } from './config';
import type { Database } from './db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: Config;
  }
}
