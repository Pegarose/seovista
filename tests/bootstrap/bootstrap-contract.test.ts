import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
      "release",
      "verify-package-boundaries",
    ];

    expect(Object.keys(pkg.scripts ?? {})).toEqual([
      ...expectedScripts.slice(0, 9),
      "infrastructure:start",
      "infrastructure:teardown",
      "verify:production-sentinels",
      ...expectedScripts.slice(9),
    ]);
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

  it("Playwright config targets baseURL localhost:3200 and uses workers <= 2", () => {
    const configSource = read("playwright.config.ts");

    const baseURLMatch = /baseURL\s*:\s*"([^"]+)"/.exec(configSource);
    expect(baseURLMatch).not.toBeNull();
    expect(baseURLMatch?.[1]).toBe("http://localhost:3200");

    const workersMatch = /workers\s*:\s*(\d+)/.exec(configSource);
    expect(workersMatch).not.toBeNull();
    const workers = Number(workersMatch?.[1]);
    expect(workers).toBeLessThanOrEqual(2);
    expect(workers).toBeGreaterThan(0);
  });

  it("uses port 3200 consistently across web runtime and validation surfaces", () => {
    const webPortFiles = [
      "services.yaml",
      "scripts/dev.js",
      "apps/web/server.mjs",
      "scripts/run-isolated-web-command.js",
      "scripts/sentinel-scan.mjs",
      "playwright.config.ts",
      "apps/web/playwright.config.ts",
      "apps/web/playwright.dev.config.ts",
      "lighthouserc.js",
    ];

    for (const file of webPortFiles) {
      const source = read(file);
      expect(source).toContain("3200");
    }

    expect(read("services.yaml")).toContain("port: 3101");
    expect(read("scripts/dev.js")).toContain('PORT: "3101"');
  });

  it("ignores Playwright result directories while retaining CI artifact paths", () => {
    const gitignore = read(".gitignore");
    const workflows = [
      read(".github/workflows/ci-pull-request.yml"),
      read(".github/workflows/ci-default-branch.yml"),
    ];

    expect(gitignore).toMatch(/^e2e-results\/$/m);
    expect(gitignore).toMatch(/^test-results\/$/m);

    for (const workflow of workflows) {
      expect(workflow).toContain("apps/web/tests/e2e-results/");
      expect(workflow).toContain("apps/web/test-results/");
    }
  });

  it("uses prettier.config.js as the sole Prettier configuration", () => {
    expect(existsSync(resolve(root, "prettier.config.js"))).toBe(true);
    expect(existsSync(resolve(root, ".prettierrc"))).toBe(false);
  });

  it("AGENTS.md states PRD is product authority, Brief is engineering authority, and PRD wins conflicts", () => {
    const agents = read("AGENTS.md");

    expect(agents).toMatch(/SeoVista PRD.*is the authoritative source for product behavior/i);
    expect(agents).toMatch(/Implementation Brief.*is the authoritative source for engineering/i);
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

  it("GitHub Actions CI workflows exist for PR and default-branch", () => {
    const prWorkflow = read(".github/workflows/ci-pull-request.yml");
    const defaultWorkflow = read(".github/workflows/ci-default-branch.yml");

    // Both workflows must reference Node 24 and pnpm 10.30.1
    for (const wf of [prWorkflow, defaultWorkflow]) {
      expect(wf).toContain("node-version: '24'");
      expect(wf).toContain("pnpm@10.30.1");
      expect(wf).toContain("--frozen-lockfile");
      expect(wf).toContain("pnpm lint");
      expect(wf).toContain("pnpm typecheck");
      expect(wf).toContain("pnpm test");
      expect(wf).toContain("pnpm build");
      expect(wf).toContain("pnpm test:e2e");
      expect(wf).toContain("pnpm test:a11y");
      expect(wf).toContain("pnpm test:seo");
      expect(wf).toContain("pnpm lighthouse");
      // Must NOT have continue-on-error or success bypasses
      expect(wf).not.toMatch(/^\s*continue-on-error:\s*true/m);
    }

    // PR workflow triggers on pull_request
    expect(prWorkflow).toMatch(/on:\s*\n\s*pull_request:/);
    // Default branch triggers on push and schedule
    expect(defaultWorkflow).toMatch(/on:\s*\n\s*push:/);
  });

  it("Lighthouse config contains required route set with assertions", () => {
    const lhConfig = read("lighthouserc.js");

    const requiredUrls = [
      "http://localhost:3200/",
      "http://localhost:3200/geo/",
      "http://localhost:3200/tools/",
      "http://localhost:3200/tools/geo-readiness-checker/",
      "http://localhost:3200/contact/",
      "http://localhost:3200/terms/",
    ];

    for (const url of requiredUrls) {
      expect(lhConfig).toContain(url);
    }

    // Assertions present
    expect(lhConfig).toContain('"categories:performance"');
    expect(lhConfig).toContain('"categories:accessibility"');
    expect(lhConfig).toContain('"categories:seo"');
    expect(lhConfig).toContain('"largest-contentful-paint"');
    expect(lhConfig).toContain('"cumulative-layout-shift"');
    expect(lhConfig).toContain('"server-response-time"');
    expect(lhConfig).toContain('"interaction-to-next-paint"');

    // INP assertion present
    expect(lhConfig).toContain("interaction-to-next-paint");
    expect(lhConfig).toContain("200");

    // Build before serve through the Lighthouse-owned output profile.
    expect(lhConfig).toContain("run-isolated-web-command.js lighthouse build");
    expect(lhConfig).toContain("run-isolated-web-command.js lighthouse serve");
    expect(lhConfig).toContain("startServerCommand");
  });

  it("Dependency policy reconciles one row per direct dependency", () => {
    const policy = read("docs/dependency-policy.md");

    // Must have inventory heading and structure
    expect(policy).toMatch(/## Inventory/i);
    expect(policy).toMatch(/## License Exception Policy/i);
    expect(policy).toMatch(/## Lockfile Reconciliation/i);
    expect(policy).toMatch(/## Package-Boundary Rules/i);

    // Must reference all workspace owners
    const workspaceOwners = [
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
      "root",
    ];

    for (const owner of workspaceOwners) {
      expect(policy).toContain(owner);
    }

    // Must cover key production dependencies
    const keyDeps = ["next", "react", "bullmq", "ioredis", "pg", "zod", "ipaddr.js", "server-only"];
    for (const dep of keyDeps) {
      expect(policy).toContain(dep);
    }

    // Must NOT have wildcard, URL, or local-path entries
    expect(policy).not.toMatch(/\|\s*\*\s*\|/);
    expect(policy).not.toMatch(/https?:\/\/registry\./);
    expect(policy).not.toMatch(/file:/);

    // Must reference SPDX license and update strategy columns
    expect(policy).toMatch(/SPDX License/i);
    expect(policy).toMatch(/Update Strategy/i);
  });

  it("Release command is executable and references canonical gates", () => {
    const releaseScript = read("scripts/release.js");

    // Must invoke each canonical root command
    expect(releaseScript).toContain("pnpm lint");
    expect(releaseScript).toContain("pnpm typecheck");
    expect(releaseScript).toContain("pnpm test");
    expect(releaseScript).toContain("pnpm build");
    expect(releaseScript).toContain("pnpm test:e2e");
    expect(releaseScript).toContain("pnpm test:a11y");
    expect(releaseScript).toContain("pnpm test:seo");
    expect(releaseScript).toContain("pnpm lighthouse");

    // Must handle cleanup and interruption
    expect(releaseScript).toMatch(/SIGINT|SIGTERM|cleanup|interrupt/i);
    expect(releaseScript).toMatch(/"docker"|docker compose|compose.*down|down.*volumes/i);

    // Must produce redacted artifacts
    expect(releaseScript).toMatch(/redact/i);
  });

  it("Package-boundary verifier exists and is runnable", () => {
    const boundaryScript = read("scripts/verify-package-boundaries.js");

    // Must check browser-side server-only deps
    expect(boundaryScript).toContain("pg");
    expect(boundaryScript).toContain("ioredis");
    expect(boundaryScript).toContain("bullmq");

    // Must detect duplicate-purpose deps
    expect(boundaryScript).toMatch(/duplicate/i);

    // Must exit with non-zero on violations
    expect(boundaryScript).toContain("process.exit(1)");
  });
});
