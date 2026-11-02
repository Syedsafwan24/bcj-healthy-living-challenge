/**
 * Rescores every active participant from their stored raw inputs.
 *
 *   npm run rescore
 *
 * Saving a scoring setting does this automatically, but a change to a rule in
 * `src/lib/challenges.ts` does not — run this once after deploying one, or
 * days saved under the old rule keep their old points.
 */

import { createRequire } from "node:module";

import "../src/db/load-env";

// `lib/scoring-save` and `db` are marked "server-only" — see mail-test.ts.
const nodeRequire = createRequire(import.meta.url);
nodeRequire.cache[nodeRequire.resolve("server-only")] = {
  exports: {},
} as never;

async function main() {
  const { getSettings } = await import("../src/lib/settings");
  const { recomputeAll } = await import("../src/lib/scoring-save");

  const count = await recomputeAll(await getSettings());
  console.log(`Rescored ${count} participants.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
