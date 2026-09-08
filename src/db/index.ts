import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

/**
 * Next re-evaluates server modules on every edit in dev. Without caching the
 * client, each save would open a new connection pool that nobody closes.
 */
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

export const sql =
  globalForDb.sql ??
  postgres(connectionString, {
    transform: postgres.camel,
    // Transaction-mode poolers (PgBouncer, Supabase's Supavisor) hand the next
    // query to a different backend connection, so prepared statements from the
    // previous one are gone. Costs a little query-plan caching on a direct
    // connection; irrelevant at this size.
    prepare: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sql = sql;
}
