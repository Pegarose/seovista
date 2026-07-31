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
    // Globals let @testing-library/react register its automatic cleanup hook
    // between tests (it detects the global afterEach at import time).
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/tests/e2e/**", "**/node_modules/**", "**/.next/**"],
  },
});
