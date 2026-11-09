/** Writes supabase/seed.sql for pasting into the Supabase SQL editor. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSeedSql } from "../seed/build-seed-sql";

const target = join(__dirname, "..", "supabase", "seed.sql");
writeFileSync(target, buildSeedSql());
console.log(`Wrote ${target}`);
