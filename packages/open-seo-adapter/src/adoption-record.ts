import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const SHA256_PATTERN = /\b[A-F0-9]{64}\b/g;
const ADAPTATION_HEADING_PATTERN = /^### (\d+)\. .+$/gm;
const EXPECTED_ADAPTATION_ROW_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
const CONSOLIDATED_ADAPTER_TEST = "packages/open-seo-adapter/src/__tests__/index.test.ts";

type AdaptationRow = {
  readonly number: number;
  readonly section: string;
};

type TestIdentifier = {
  readonly describe: string;
  readonly test: string;
};

export type OpenSeoAdoptionVerification = {
  readonly licenseDigest: string;
  readonly adaptationRows: readonly number[];
  readonly destinations: readonly string[];
  readonly testEvidence: readonly string[];
};

export class OpenSeoAdoptionVerificationError extends Error {
  override name = "OpenSeoAdoptionVerificationError";
}

function fail(message: string): never {
  throw new OpenSeoAdoptionVerificationError(message);
}

function sectionAfter(markdown: string, heading: string): string {
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex === -1) {
    fail(`Missing ${heading} section.`);
  }

  const contentStart = headingIndex + heading.length;
  const nextHeadingIndex = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(contentStart, nextHeadingIndex === -1 ? undefined : nextHeadingIndex);
}

function oneDigest(source: string, context: string): string {
  const digests = source.match(SHA256_PATTERN) ?? [];
  if (digests.length !== 1) {
    fail(`${context} must contain exactly one SHA-256 digest.`);
  }

  return digests[0]!;
}

function licenseDigestFromNotices(notices: string): string {
  const openSeoSection = sectionAfter(notices, "### OpenSEO");
  const licenseBlock = /```text\r?\n([\s\S]*?)```/.exec(openSeoSection)?.[1];
  if (licenseBlock === undefined) {
    fail("OpenSEO notice must contain the complete MIT license text in a text code block.");
  }

  return createHash("sha256")
    .update(licenseBlock.replace(/\r?\n$/, ""), "utf8")
    .digest("hex")
    .toUpperCase();
}

function adaptationRows(markdown: string): readonly AdaptationRow[] {
  const inventory = sectionAfter(markdown, "## Adaptation Inventory");
  const headings = [...inventory.matchAll(ADAPTATION_HEADING_PATTERN)];

  if (headings.length !== EXPECTED_ADAPTATION_ROW_NUMBERS.length) {
    fail(
      `OpenSEO adoption inventory must contain exactly ${EXPECTED_ADAPTATION_ROW_NUMBERS.length} rows.`
    );
  }

  const rows = headings.map((heading, index) => {
    const sectionStart = heading.index! + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? inventory.length;
    return {
      number: Number(heading[1]),
      section: inventory.slice(sectionStart, sectionEnd),
    };
  });

  if (
    !rows.every(
      (row, index) => row.number === EXPECTED_ADAPTATION_ROW_NUMBERS[index]
    )
  ) {
    fail(
      `OpenSEO adoption inventory row numbers must be the ordered sequence [${EXPECTED_ADAPTATION_ROW_NUMBERS.join(", ")}].`
    );
  }

  return rows;
}

function valueFor(row: AdaptationRow, field: string): string {
  const value = new RegExp(`\\|\\s+\\*\\*${field}\\*\\*\\s+\\|\\s+(.+?)\\s+\\|`).exec(
    row.section
  )?.[1];
  if (value === undefined) {
    fail(`Adaptation row ${row.number} is missing ${field}.`);
  }

  return value;
}

function repositoryPaths(value: string): readonly string[] {
  return [...value.matchAll(/`(packages\/[\w./-]+)`/g)].map((match) => match[1]!);
}

function testIdentifier(value: string, rowNumber: number): TestIdentifier {
  const match =
    /\(describe: `([^`]+)`; test: `([^`]+)`\)/.exec(value) ??
    fail(`Adaptation row ${rowNumber} must provide unambiguous describe and test identifiers.`);

  return { describe: match[1]!, test: match[2]! };
}

async function existingPath(root: string, relativePath: string, label: string): Promise<void> {
  if (relativePath.split("/").includes("..") || relativePath.includes("\\")) {
    fail(`${label} must be a repository-relative path.`);
  }

  try {
    await stat(resolve(root, ...relativePath.split("/")));
  } catch {
    fail(`${label} does not exist: ${relativePath}`);
  }
}

async function verifyTestIdentifiers(
  root: string,
  testPath: string,
  identifier: TestIdentifier,
  rowNumber: number
): Promise<void> {
  const source = await readFile(resolve(root, ...testPath.split("/")), "utf8");
  if (
    !source.includes(`describe('${identifier.describe}'`) ||
    !source.includes(`it('${identifier.test}'`)
  ) {
    fail(`Adaptation row ${rowNumber} test identifiers do not resolve in ${testPath}.`);
  }
}

export async function verifyOpenSeoAdoptionRecord(
  repositoryRoot: string
): Promise<OpenSeoAdoptionVerification> {
  const root = resolve(repositoryRoot);
  const [adoptionRecord, notices] = await Promise.all([
    readFile(resolve(root, "docs", "open-seo-adoption.md"), "utf8"),
    readFile(resolve(root, "THIRD_PARTY_NOTICES.md"), "utf8"),
  ]);

  const provenanceDigest = oneDigest(sectionAfter(adoptionRecord, "## Provenance"), "Provenance");
  const verifierDigest = oneDigest(
    sectionAfter(adoptionRecord, "## Verifier Compliance"),
    "Verifier Compliance"
  );
  const noticeDeclaration = oneDigest(sectionAfter(notices, "### OpenSEO"), "OpenSEO notice");
  const noticeLicenseDigest = licenseDigestFromNotices(notices);

  if (
    provenanceDigest !== verifierDigest ||
    provenanceDigest !== noticeDeclaration ||
    provenanceDigest !== noticeLicenseDigest
  ) {
    fail(
      "OpenSEO license digest must match Provenance, Verifier Compliance, and THIRD_PARTY_NOTICES.md."
    );
  }

  const rows = adaptationRows(adoptionRecord);
  const destinations: string[] = [];
  const testEvidence: string[] = [];

  for (const row of rows) {
    const destinationPaths = repositoryPaths(valueFor(row, "SeoVista Destination"));
    const testValue = valueFor(row, "Test");
    const testPaths = repositoryPaths(testValue);

    if (destinationPaths.length === 0) {
      fail(`Adaptation row ${row.number} must record at least one SeoVista destination.`);
    }
    if (testPaths.length === 0) {
      fail(`Adaptation row ${row.number} must record at least one test evidence path.`);
    }

    for (const destinationPath of destinationPaths) {
      await existingPath(root, destinationPath, `Adaptation row ${row.number} destination path`);
      destinations.push(destinationPath);
    }
    for (const testPath of testPaths) {
      await existingPath(root, testPath, `Adaptation row ${row.number} test evidence path`);
      testEvidence.push(testPath);
    }

    if (row.number <= 4) {
      if (testPaths.length !== 1 || testPaths[0] !== CONSOLIDATED_ADAPTER_TEST) {
        fail(
          `Adaptation row ${row.number} must reference ${CONSOLIDATED_ADAPTER_TEST} as its consolidated test evidence.`
        );
      }
      await verifyTestIdentifiers(
        root,
        testPaths[0],
        testIdentifier(testValue, row.number),
        row.number
      );
    }
  }

  return {
    licenseDigest: provenanceDigest,
    adaptationRows: rows.map((row) => row.number),
    destinations,
    testEvidence,
  };
}
