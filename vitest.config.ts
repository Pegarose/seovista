import { defineConfig } from "vitest/config";

export default defineConfig({
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
