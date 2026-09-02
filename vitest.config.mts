import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**"],
    // The integration suite writes to DATABASE_URL, so it runs on its own
    // rather than alongside the pure unit tests.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
      // Next resolves this to a no-op on the server. Vitest has no server /
      // client split, so point it at the package's empty entry.
      "server-only": path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "./node_modules/server-only/empty.js",
      ),
    },
  },
});
