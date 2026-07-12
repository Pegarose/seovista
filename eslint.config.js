import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";

const __dirname = dirname(fileURLToPath(import.meta.url));

const workspaceDirs = [
  "apps/web",
  "apps/nextg",
  "apps/worker",
  "packages/ui",
  "packages/seo-core",
  "packages/schema",
  "packages/content-models",
  "packages/audit-core",
  "packages/open-seo-adapter",
  "packages/dataforseo",
  "packages/geo-engine",
  "packages/reports",
  "packages/analytics",
];

const tsParserOptions = {
  project: true,
  tsconfigRootDir: __dirname,
};

export default tseslint.config(
  {
    name: "seovista/ignore",
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/out/**",
      "**/build/**",
      "**/.turbo/**",
      "pnpm-lock.yaml",
      "**/*.d.ts",
    ],
  },
  eslint.configs.recommended,
  ...workspaceDirs.map((dir) => ({
    name: `seovista/${dir}`,
    files: [`${dir}/**/*.ts`, `${dir}/**/*.tsx`, `${dir}/**/*.js`, `${dir}/**/*.jsx`],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: tsParserOptions,
    },
    plugins: {
      import: importPlugin,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "import/no-unresolved": "error",
      "import/named": "error",
      "import/namespace": "error",
      "import/default": "error",
      "import/export": "error",
      "import/no-cycle": "error",
      "import/no-duplicates": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "no-debugger": "error",
      "no-undef": "off",
      eqeqeq: ["error", "always"],
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: resolve(__dirname, "tsconfig.base.json"),
        },
      },
    },
  })),
  {
    name: "seovista/root",
    files: ["*.js", "*.ts", "*.mjs", "*.cjs"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: tsParserOptions,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  prettier
);
