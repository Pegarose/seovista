import { defineConfig } from "vitest/config";

import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../");
const webSrc = resolve(import.meta.dirname, "src");

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": webSrc,
      "server-only": resolve(root, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/tests/e2e/**", "**/node_modules/**", "**/.next/**"],
  },
});
