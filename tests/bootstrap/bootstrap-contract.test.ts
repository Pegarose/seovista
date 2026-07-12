import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf-8");
}

describe("monorepo bootstrap contract", () => {
  it("pnpm-workspace.yaml lists all 3 apps and all 11 packages", () => {
    const workspaceYaml = read("pnpm-workspace.yaml");
    const lines = workspaceYaml
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));
    const packages = lines.map((line) => line.replace(/^- /, ""));

    const expectedApps = ["apps/web", "apps/nextg", "apps/worker"];
    const expectedPackages = [
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

    const expected = [...expectedApps, ...expectedPackages];

    expect(packages).toEqual(expected);
  });

  it("root package.json contains exactly the required scripts and engine metadata", () => {
    const pkg = JSON.parse(read("package.json")) as {
      packageManager?: string;
      engines?: { node?: string; pnpm?: string };
      scripts?: Record<string, string>;
    };

    const expectedScripts = [
      "dev",
      "build",
      "typecheck",
      "lint",
      "test",
      "test:e2e",
      "test:a11y",
      "test:seo",
      "lighthouse",
    ];

    expect(Object.keys(pkg.scripts ?? {})).toEqual(expectedScripts);
    expect(pkg.packageManager).toBe("pnpm@10.30.1");
    expect(pkg.engines?.node).toBe(">=24.0.0 <25.0.0");
    expect(pkg.engines?.pnpm).toBe("10.30.1");
  });

  it("shared tsconfig.base.json has strict TypeScript flags enabled", () => {
    const tsconfig = JSON.parse(read("tsconfig.base.json")) as {
      compilerOptions?: {
        strict?: boolean;
        noImplicitAny?: boolean;
        strictNullChecks?: boolean;
      };
    };

    expect(tsconfig.compilerOptions?.strict).toBe(true);
    expect(tsconfig.compilerOptions?.noImplicitAny).toBe(true);
    expect(tsconfig.compilerOptions?.strictNullChecks).toBe(true);
  });

  it("ESLint flat config covers all 13 workspaces", () => {
    const configSource = read("eslint.config.js");

    const expected = [
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

    for (const dir of expected) {
      expect(configSource).toContain(dir);
    }
  });

  it("Vitest config uses maxThreads <= 2", () => {
    const configSource = read("vitest.config.ts");
    const maxThreadsMatch = /maxThreads\s*:\s*(\d+)/.exec(configSource);
    expect(maxThreadsMatch).not.toBeNull();
    const maxThreads = Number(maxThreadsMatch?.[1]);
    expect(maxThreads).toBeLessThanOrEqual(2);
    expect(maxThreads).toBeGreaterThan(0);
  });

  it("Playwright config targets baseURL localhost:3100 and uses workers <= 2", () => {
    const configSource = read("playwright.config.ts");

    const baseURLMatch = /baseURL\s*:\s*"([^"]+)"/.exec(configSource);
    expect(baseURLMatch).not.toBeNull();
    expect(baseURLMatch?.[1]).toBe("http://localhost:3100");

    const workersMatch = /workers\s*:\s*(\d+)/.exec(configSource);
    expect(workersMatch).not.toBeNull();
    const workers = Number(workersMatch?.[1]);
    expect(workers).toBeLessThanOrEqual(2);
    expect(workers).toBeGreaterThan(0);
  });

  it("AGENTS.md states PRD is product authority, Brief is engineering authority, and PRD wins conflicts", () => {
    const agents = read("AGENTS.md");

    expect(agents).toMatch(
      /SeoVista PRD.*is the authoritative source for product behavior/i,
    );
    expect(agents).toMatch(
      /Implementation Brief.*is the authoritative source for engineering/i,
    );
    expect(agents).toMatch(/the PRD wins/i);
  });

  it("README.md documents architecture, prerequisites, ports, setup, commands, teardown, and mock limitations", () => {
    const readme = read("README.md");

    expect(readme).toMatch(/## Architecture/i);
    expect(readme).toMatch(/## Prerequisites/i);
    expect(readme).toMatch(/## Assigned Ports/i);
    expect(readme).toMatch(/## Setup/i);
    expect(readme).toMatch(/## Commands/i);
    expect(readme).toMatch(/## Teardown/i);
    expect(readme).toMatch(/## Provider-Mock Limitations/i);
  });

  it(".env.example contains all consumed env var names and no secret values", () => {
    const envExample = read(".env.example");
    const expectedVars = [
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_ANALYTICS_ID",
      "DATABASE_URL",
      "REDIS_URL",
      "NEXTG_API_URL",
      "NEXTG_API_TOKEN",
      "DATAFORSEO_API_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REDIRECT_URI",
      "OBJECT_STORAGE_ENDPOINT",
      "OBJECT_STORAGE_BUCKET",
      "OBJECT_STORAGE_ACCESS_KEY",
      "OBJECT_STORAGE_SECRET_KEY",
      "EMAIL_PROVIDER_API_KEY",
      "EMAIL_FROM",
      "SENTRY_DSN",
      "REPORT_SIGNING_SECRET",
      "AUDIT_DAILY_COST_LIMIT",
      "AUDIT_PER_IP_RATE_LIMIT",
    ];

    for (const envVar of expectedVars) {
      expect(envExample).toContain(envVar);
    }

    const secretLikePatterns = [
      /sk-[a-zA-Z0-9]+/,
      /[a-zA-Z0-9]{32,}/,
      /-----BEGIN [A-Z ]+ KEY-----/,
      /[0-9a-f]{64}/i,
      /postgres:\/\/[^:]+:[^@]+@/,
      /redis:\/\/:[^@]+@/,
    ];

    for (const pattern of secretLikePatterns) {
      expect(envExample).not.toMatch(pattern);
    }
  });

  it("SECURITY.md states vulnerability reporting and secret handling policy", () => {
    const security = read("SECURITY.md");

    expect(security).toMatch(/Reporting Vulnerabilities/i);
    expect(security).toMatch(/Secret Handling/i);
  });

  it("THIRD_PARTY_NOTICES.md has OpenSEO attribution with the required commit", () => {
    const notices = read("THIRD_PARTY_NOTICES.md");

    expect(notices).toMatch(/## MIT License Notices/i);
    expect(notices).toMatch(/### OpenSEO/i);
    expect(notices).toContain("3f2b4872caef809f0280a765f9eb469e8a6b523a");
    expect(notices).toMatch(/## Other Licenses/i);
  });

  it("Three ADRs exist in docs/adr with required sections", () => {
    const adrs = [
      "docs/adr/0001-contract-first-provider-mock-boundary.md",
      "docs/adr/0002-trusted-canonical-server-rendering-boundary.md",
      "docs/adr/0003-openseo-engine-donor-adaptation-boundary.md",
    ];

    for (const adr of adrs) {
      const content = read(adr);
      expect(content).toMatch(/## Context/i);
      expect(content).toMatch(/## Decision/i);
      expect(content).toMatch(/## Consequences/i);
      expect(content).toMatch(/## Status/i);
      expect(content).toMatch(/## Supersedes/i);
      expect(content).toMatch(/## Superseded by/i);
    }
  });
});
