import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = resolve(webRoot, "../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(path);
    }

    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("web shared-authority boundaries", () => {
  it("uses the shared UI package without retaining a local primitive module", () => {
    expect(existsSync(join(webRoot, "src/components/ui.tsx"))).toBe(false);

    const packageJson = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(packageJson.dependencies?.["@seovista/ui"]).toBe("workspace:*");

    for (const file of sourceFiles(join(webRoot, "app")).concat(sourceFiles(join(webRoot, "src/components")))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain('from "@/components/ui"');
      expect(source, file).not.toContain("from '@/components/ui'");
    }
  });

  it("delegates all web security-header policy to seo-core", () => {
    const nextConfig = readFileSync(join(webRoot, "next.config.ts"), "utf8");
    const productionServer = readFileSync(join(webRoot, "server.mjs"), "utf8");

    expect(nextConfig).toContain('from "@seovista/seo-core/security/headers"');
    expect(nextConfig).toContain("nextSecurityHeaders");
    expect(nextConfig).not.toContain("Content-Security-Policy");

    expect(productionServer).toContain('from "@seovista/seo-core/security/headers"');
    expect(productionServer).toContain("buildSecurityHeaders");
  });

  it("keeps no web-local security-header implementation", () => {
    const webSources = sourceFiles(join(webRoot, "app")).concat(sourceFiles(join(webRoot, "src")));
    const localHeaderDefinitions = webSources.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("Content-Security-Policy") || source.includes("Strict-Transport-Security");
    });

    expect(localHeaderDefinitions).toEqual([]);
    expect(existsSync(join(repositoryRoot, "packages/seo-core/src/security/headers.ts"))).toBe(true);
  });
});
