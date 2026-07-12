import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const __dirname = import.meta.dirname ?? resolve();

export default defineConfig({
  resolve: {
    alias: {
      // server-only throws unconditionally in non-Next.js runtimes; treat it
      // as a no-op in tests so server-only modules can be unit-tested. The
      // Next.js client boundary is still enforced at build time.
      "server-only": resolve(__dirname, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 2,
        minThreads: 1,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
