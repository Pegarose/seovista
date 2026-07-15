import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "server-only": resolve(root, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    globalSetup: [resolve(import.meta.dirname, "src/__tests__/helpers/global-setup.ts")],
    setupFiles: [resolve(import.meta.dirname, "src/__tests__/helpers/setup-file.ts")],
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 2,
        minThreads: 1,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 90_000,
    teardownTimeout: 90_000,
  },
});
