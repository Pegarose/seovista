import { defineConfig } from "vitest/config";

import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../");

export default defineConfig({
  resolve: {
    alias: {
      "server-only": resolve(root, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/tests/e2e/**", "**/node_modules/**", "**/.next/**"],
  },
});
