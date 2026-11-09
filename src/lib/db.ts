import "server-only";
import postgres from "postgres";

/**
 * Minimal database interface. Production uses postgres.js against Supabase
 * Postgres; tests swap in PGlite (in-process Postgres) via setDbForTesting.
 * All queries use $1…$n placeholders – values are always sent as bind
 * parameters, never interpolated into SQL text.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}

let override: Db | null = null;
export function setDbForTesting(db: Db | null): void {
  override = db;
}

type AnySql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: AnySql): Db {
  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return rows as unknown as T[];
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R> {
      if ("begin" in sql && typeof sql.begin === "function") {
        return (await sql.begin((tx) => fn(wrap(tx)))) as R;
      }
      return fn(wrap(sql)); // already inside a transaction
    },
  };
}

const globalForDb = globalThis as unknown as { __sealeSql?: postgres.Sql };

export function getDb(): Db {
  if (override) return override;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForDb.__sealeSql ??= postgres(url, {
    prepare: false, // required for Supabase's transaction-mode pooler (port 6543)
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return wrap(globalForDb.__sealeSql);
}
