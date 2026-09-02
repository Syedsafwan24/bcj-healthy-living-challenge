import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. See section 13 of the specification.");
}

/**
 * One pool per process. Next.js reloads modules in development, so the client
 * is cached on globalThis to avoid exhausting Postgres connections.
 */
const globalForDb = globalThis as unknown as {
  bcjSql?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.bcjSql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 5,
    // Calendar dates and timestamps are handled explicitly, never by the
    // server's local timezone.
    types: {
      date: {
        to: 1082,
        from: [1082],
        serialize: (v: string) => v,
        parse: (v: string) => v,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForDb.bcjSql = client;

export const db = drizzle(client, { schema });
export { client as sql };
export * from "./schema";
