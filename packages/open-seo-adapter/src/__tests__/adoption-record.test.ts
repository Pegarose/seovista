import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyOpenSeoAdoptionRecord } from "../adoption-record.js";

const OPEN_SEO_LICENSE_SHA256 = "62DE25B254287E61E6026AC04A629FBFA88332D14E4175D408092229D80E0D3C";
const repositoryRoot = join(import.meta.dirname, "../../../..");
const temporaryRoots: string[] = [];

async function createValidFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "seovista-open-seo-adoption-"));
  temporaryRoots.push(root);

  const licenseText = "MIT License\n\nCopyright (c) 2026 Ben Senescu\n";
  const digest = createHash("sha256")
    .update(licenseText.replace(/\n$/, ""), "utf8")
    .digest("hex")
    .toUpperCase();
  const testPath = "packages/open-seo-adapter/src/__tests__/index.test.ts";
  const rows = Array.from({ length: 7 }, (_, index) => {
    const number = index + 1;
    const identifier =
      number <= 4 ? ` (describe: \`fixture adaptation\`; test: \`verifies fixture\`)` : "";
    return `### ${number}. Fixture adaptation\n\n| Field | Value |\n|-------|-------|\n| **SeoVista Destination** | \`packages/open-seo-adapter/src/index.ts\` |\n| **Test** | \`${testPath}\`${identifier} |`;
  }).join("\n\n");

  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "packages/open-seo-adapter/src/__tests__"), { recursive: true });
  await writeFile(join(root, "packages/open-seo-adapter/src/index.ts"), "export {};\n");
  await writeFile(
    join(root, testPath),
    "describe('fixture adaptation', () => { it('verifies fixture', () => {}); });\n"
  );
  await writeFile(
    join(root, "THIRD_PARTY_NOTICES.md"),
    `### OpenSEO\n\n- License SHA-256: \`${digest}\`\n\n\`\`\`text\n${licenseText}\`\`\`\n`
  );
  await writeFile(
    join(root, "docs/open-seo-adoption.md"),
    `## Provenance\n\n| Field | Value |\n|-------|-------|\n| **License SHA-256** | \`${digest}\` |\n\n## Adaptation Inventory\n\n${rows}\n\n## Verifier Compliance\n\n1. **License digest**: SHA-256 matches \`${digest}\`.\n`
  );

  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("OpenSEO adoption record verification", () => {
  it("reconciles the committed seven-row inventory with the notice-derived license digest", async () => {
    const result = await verifyOpenSeoAdoptionRecord(repositoryRoot);

    expect(result.licenseDigest).toBe(OPEN_SEO_LICENSE_SHA256);
    expect(result.adaptationRows).toHaveLength(7);
    expect(result.destinations).toHaveLength(9);
    expect(result.testEvidence).toHaveLength(7);
  });

  it("rejects a stale adoption-record digest", async () => {
    const root = await createValidFixture();
    const adoptionPath = join(root, "docs/open-seo-adoption.md");
    const record = await (await import("node:fs/promises")).readFile(adoptionPath, "utf8");
    await writeFile(adoptionPath, record.replace(/([A-F0-9]{64})/, "0".repeat(64)));

    await expect(verifyOpenSeoAdoptionRecord(root)).rejects.toThrow(/license digest/i);
  });

  it("rejects an unresolved adaptation destination", async () => {
    const root = await createValidFixture();
    const adoptionPath = join(root, "docs/open-seo-adoption.md");
    const record = await (await import("node:fs/promises")).readFile(adoptionPath, "utf8");
    await writeFile(adoptionPath, record.replace("src/index.ts", "src/missing.ts"));

    await expect(verifyOpenSeoAdoptionRecord(root)).rejects.toThrow(/destination path/i);
  });

  it("rejects an unresolved adaptation test-evidence path", async () => {
    const root = await createValidFixture();
    const adoptionPath = join(root, "docs/open-seo-adoption.md");
    const record = await (await import("node:fs/promises")).readFile(adoptionPath, "utf8");
    await writeFile(
      adoptionPath,
      record.replace("__tests__/index.test.ts", "__tests__/missing.test.ts")
    );

    await expect(verifyOpenSeoAdoptionRecord(root)).rejects.toThrow(/test evidence path/i);
  });
});
