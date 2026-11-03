import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>['db'];

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
    // Return bigint (int8) columns as JS numbers – amounts are well within the safe range.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: number | bigint) => x.toString(),
        parse: (x: string) => Number(x),
      },
    },
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client };
}

export { schema };
