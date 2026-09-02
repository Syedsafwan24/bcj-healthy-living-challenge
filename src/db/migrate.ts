/**
 * Applies the bootstrap objects, then the generated drizzle migrations.
 *
 *   npm run db:migrate
 */

import "./load-env";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1 });

  const bootstrap = readFileSync(join(process.cwd(), "src/db/bootstrap.sql"), "utf8");
  await client.unsafe(bootstrap);
  console.log("bootstrap applied: citext, pgcrypto, participant_seq");

  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
