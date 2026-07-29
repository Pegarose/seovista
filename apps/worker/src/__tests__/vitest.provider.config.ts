import { resolve } from "path";
import { defineConfig } from "vitest/config";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");

export default defineConfig({
  resolve: {
    alias: {
      "server-only": resolve(root, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // No globalSetup — provider selection tests don't need PostgreSQL/Redis
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 15_000,
    hookTimeout: 30_000,
    include: ["**/provider-selection.test.ts"],
  },
});
