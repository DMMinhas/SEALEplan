import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import type { Db } from "@/lib/db";

type Queryable = PGlite | Transaction;

function wrap(pg: Queryable): Db {
  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const res = await pg.query<T>(text, params as unknown[]);
      return res.rows;
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R> {
      if (pg instanceof PGlite) return pg.transaction((tx) => fn(wrap(tx)));
      return fn(wrap(pg));
    },
  };
}

/** Fresh in-memory Postgres with the real migration applied. */
export async function createTestDb(): Promise<{ pg: PGlite; db: Db }> {
  const pg = new PGlite();
  const migration = readFileSync(
    join(__dirname, "..", "..", "supabase", "migrations", "0001_init.sql"),
    "utf8",
  );
  await pg.exec(migration);
  return { pg, db: wrap(pg) };
}
