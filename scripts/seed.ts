/**
 * Seeds DATABASE_URL with the fictional respondents.
 *   npm run seed            – insert (idempotent)
 *   npm run seed -- --reset – delete ALL responses first (asks no questions; test projects only)
 */
import postgres from "postgres";
import { buildSeedSql } from "../seed/build-seed-sql";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (e.g. via .env.local and `node --env-file`)");
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    if (process.argv.includes("--reset")) {
      await sql.unsafe("delete from response");
      console.log("Deleted existing responses.");
    }
    await sql.unsafe(buildSeedSql());
    const [{ n }] = await sql.unsafe<{ n: number }[]>("select count(*)::int as n from response");
    console.log(`Seed complete – ${n} responses in the database.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
