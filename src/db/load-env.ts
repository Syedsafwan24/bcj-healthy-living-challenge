import { config } from "dotenv";

/**
 * Loads environment variables for the CLI scripts (migrate, seed, drizzle-kit).
 *
 * `next dev` reads `.env.local` on its own; plain Node does not, so the same
 * precedence is reproduced here: `.env.local` first, then `.env` for anything
 * it did not set.
 */
config({ path: ".env.local" });
config();
