import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCrewCatalog,
  crewCatalogSchema,
  type CrewService,
} from "../catalog/index.js";
import { ISSUE_TAGS, type IssueTag } from "../issue-tags.js";
import catalogFixture from "../catalog/crew-services.json";

/**
 * Crew service catalog loader tests for the `crew-service-catalog-fixture`
 * feature. Locks in VAL-B-CATALOG-004 / 005 / 006 / 014:
 *   - 004: loadCrewCatalog() returns 5–8 fully-shaped, Zod-validated services.
 *   - 005: malformed catalog (missing field, wrong type, empty tags,
 *     out-of-vocab tag, invalid tier, count outside 5–8) throws at load.
 *   - 006: a swapped schema-valid fixture at the same path loads with no code
 *     change; no service_id literals live outside the fixture/tests.
 *   - 014: tier must be a member of free|pro|agency; any other value throws.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_FIXTURE_PATH = join(__dirname, "..", "catalog", "crew-services.json");
const ISSUE_TAG_SET: ReadonlySet<string> = new Set(ISSUE_TAGS);

// ── A complete, schema-valid service template used to build fixture variants ─
function makeService(overrides: Partial<CrewService> & { service_id?: string } = {}): CrewService {
  return {
    service_id: "svc-template",
    name: "Şablon Hizmet",
    description: "Şablon açıklama.",
    target_issue_tags: ["schema"],
    tier: "pro",
    sla: "1 gün",
    ...overrides,
  } as CrewService;
}

function makeCatalog(count: number, overrides: Partial<CrewService> = {}): CrewService[] {
  const services: CrewService[] = [];
  for (let i = 0; i < count; i++) {
    services.push(makeService({ service_id: `svc-${i}`, ...overrides }));
  }
  return services;
}

// ── VAL-B-CATALOG-004: well-formed fixture loads and validates ───────────────
describe("VAL-B-CATALOG-004: catalog loads and Zod-validates a well-formed fixture", () => {
  it("returns a non-empty array of 5–8 services from the on-disk fixture", () => {
    const catalog = loadCrewCatalog();
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThanOrEqual(5);
    expect(catalog.length).toBeLessThanOrEqual(8);
  });

  it("every returned service has the full required shape", () => {
    const catalog = loadCrewCatalog();
    for (const svc of catalog) {
      expect(typeof svc.service_id).toBe("string");
      expect(svc.service_id.length).toBeGreaterThan(0);
      expect(typeof svc.name).toBe("string");
      expect(svc.name.length).toBeGreaterThan(0);
      expect(typeof svc.description).toBe("string");
      expect(svc.description.length).toBeGreaterThan(0);
      expect(Array.isArray(svc.target_issue_tags)).toBe(true);
      expect(svc.target_issue_tags.length).toBeGreaterThan(0);
      expect(typeof svc.tier).toBe("string");
      expect(typeof svc.sla).toBe("string");
      expect(svc.sla.length).toBeGreaterThan(0);
    }
  });

  it("every target_issue_tags entry is a member of the canonical IssueTag union", () => {
    const catalog = loadCrewCatalog();
    for (const svc of catalog) {
      for (const tag of svc.target_issue_tags) {
        expect(ISSUE_TAG_SET.has(tag as string)).toBe(true);
      }
    }
  });

  it("every tier is a member of free|pro|agency", () => {
    const catalog = loadCrewCatalog();
    const validTiers = new Set(["free", "pro", "agency"]);
    for (const svc of catalog) {
      expect(validTiers.has(svc.tier)).toBe(true);
    }
  });

  it("returned services conform to the validated CrewService type (schema re-parse)", () => {
    const catalog = loadCrewCatalog();
    // Re-parsing the loaded output must succeed — the loader returns exactly
    // the validated shape, nothing partial/coerced.
    expect(() => crewCatalogSchema.parse(catalog)).not.toThrow();
  });

  it("the on-disk fixture parses to the same services as the imported JSON module", () => {
    const fromDisk = loadCrewCatalog();
    const fromImport = crewCatalogSchema.parse(catalogFixture);
    expect(fromDisk).toEqual(fromImport);
  });
});

// ── VAL-B-CATALOG-005: malformed catalog fails fast at load ──────────────────
describe("VAL-B-CATALOG-005: invalid catalog fails fast at load", () => {
  it("throws on a missing required field (no service_id)", () => {
    const bad = makeCatalog(5);
    delete (bad[0] as Partial<CrewService>).service_id;
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on a missing required field (no target_issue_tags)", () => {
    const bad = makeCatalog(5);
    delete (bad[0] as Partial<CrewService>).target_issue_tags;
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on a missing required field (no tier)", () => {
    const bad = makeCatalog(5);
    delete (bad[0] as Partial<CrewService>).tier;
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on a missing required field (no sla)", () => {
    const bad = makeCatalog(5);
    delete (bad[0] as Partial<CrewService>).sla;
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on a wrong type (service_id as number)", () => {
    const bad = makeCatalog(5);
    (bad[0] as unknown as { service_id: number }).service_id = 42;
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on a wrong type (target_issue_tags as string)", () => {
    const bad = makeCatalog(5);
    (bad[0] as unknown as { target_issue_tags: string }).target_issue_tags = "schema";
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on empty target_issue_tags", () => {
    const bad = makeCatalog(5, { target_issue_tags: [] });
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on an out-of-vocabulary tag", () => {
    const bad = makeCatalog(5, { target_issue_tags: ["schema", "not-a-real-tag" as IssueTag] });
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on an invalid tier (premium)", () => {
    const bad = makeCatalog(5, { tier: "premium" as CrewService["tier"] });
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws on an empty-string tier", () => {
    const bad = makeCatalog(5, { tier: "" as CrewService["tier"] });
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws when service count is below 5 (4 services)", () => {
    const bad = makeCatalog(4);
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws when service count is above 8 (9 services)", () => {
    const bad = makeCatalog(9);
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("throws when the catalog root is not an array (object)", () => {
    expect(() => loadCrewCatalog({ services: makeCatalog(5) })).toThrow();
  });

  it("throws when the catalog root is not an array (null)", () => {
    expect(() => loadCrewCatalog(null)).toThrow();
  });

  it("never returns partial/undefined on a malformed source (throw is synchronous)", () => {
    const bad = makeCatalog(5);
    delete (bad[0] as Partial<CrewService>).service_id;
    let result: CrewService[] | undefined;
    try {
      result = loadCrewCatalog(bad);
    } catch {
      // expected
    }
    expect(result).toBeUndefined();
  });
});

// ── VAL-B-CATALOG-006: fixture is replaceable; no hardcoded service_ids ──────
describe("VAL-B-CATALOG-006: catalog fixture is replaceable at the same path", () => {
  it("loads a swapped schema-valid fixture via the source seam with no code change", () => {
    const swapped: CrewService[] = [
      makeService({ service_id: "swapped-a", name: "Takas A", target_issue_tags: ["indexability"], tier: "free", sla: "1g" }),
      makeService({ service_id: "swapped-b", name: "Takas B", target_issue_tags: ["schema"], tier: "pro", sla: "2g" }),
      makeService({ service_id: "swapped-c", name: "Takas C", target_issue_tags: ["content-depth"], tier: "agency", sla: "3g" }),
      makeService({ service_id: "swapped-d", name: "Takas D", target_issue_tags: ["citations"], tier: "free", sla: "4g" }),
      makeService({ service_id: "swapped-e", name: "Takas E", target_issue_tags: ["ai-visibility"], tier: "pro", sla: "5g" }),
    ];
    const loaded = loadCrewCatalog(swapped);
    expect(loaded).toHaveLength(5);
    expect(loaded.map((s) => s.service_id)).toEqual([
      "swapped-a", "swapped-b", "swapped-c", "swapped-d", "swapped-e",
    ]);
  });

  it("a swapped fixture with an invalid tier still throws (schema unchanged)", () => {
    const swapped: CrewService[] = makeCatalog(5, { tier: "enterprise" as CrewService["tier"] });
    expect(() => loadCrewCatalog(swapped)).toThrow();
  });

  it("no service_id literal from the fixture appears in engine/matcher source (grep clean)", () => {
    const fixtureText = readFileSync(CATALOG_FIXTURE_PATH, "utf8");
    const ids = Array.from(fixtureText.matchAll(/"service_id"\s*:\s*"([^"]+)"/g)).map(
      (m) => (m as RegExpMatchArray)[1],
    );
    expect(ids.length).toBeGreaterThanOrEqual(5);

    // Scan the geo-engine src tree (excluding the fixture and these tests) for
    // any service_id literal appearing as a string — the catalog contents must
    // not be hardcoded anywhere else.
    const srcRoot = join(__dirname, "..");
    const offendingFiles: string[] = [];
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const rel = relative(srcRoot, full);
        if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
        const st = statSync(full);
        if (st.isDirectory()) {
          scan(full);
          continue;
        }
        if (!full.endsWith(".ts")) continue;
        // Skip the fixture-adjacent catalog module itself (it only references
        // the JSON by path, never a service_id literal).
        const text = readFileSync(full, "utf8");
        for (const id of ids) {
          if (text.includes(`"${id}"`)) {
            offendingFiles.push(`${rel} (contains "${id}")`);
          }
        }
      }
    };
    scan(srcRoot);
    expect(offendingFiles).toEqual([]);
  });
});

// ── VAL-B-CATALOG-014: tier is a member of the request-tier enum ─────────────
describe("VAL-B-CATALOG-014: catalog service tier is a member of free|pro|agency", () => {
  it("the on-disk fixture uses only free|pro|agency and covers all three", () => {
    const catalog = loadCrewCatalog();
    const tiers = new Set(catalog.map((s) => s.tier));
    for (const t of tiers) {
      expect(["free", "pro", "agency"]).toContain(t);
    }
    expect(tiers.has("free")).toBe(true);
    expect(tiers.has("pro")).toBe(true);
    expect(tiers.has("agency")).toBe(true);
  });

  it("rejects tier: 'premium' with a Zod error naming the tier field", () => {
    const bad = makeCatalog(5, { tier: "premium" as CrewService["tier"] });
    let err: unknown;
    try {
      loadCrewCatalog(bad);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(String(err)).toMatch(/tier/i);
  });

  it("rejects tier: 'enterprise'", () => {
    const bad = makeCatalog(5, { tier: "enterprise" as CrewService["tier"] });
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("rejects tier: 'basic'", () => {
    const bad = makeCatalog(5, { tier: "basic" as CrewService["tier"] });
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("rejects an empty-string tier", () => {
    const bad = makeCatalog(5, { tier: "" as CrewService["tier"] });
    expect(() => loadCrewCatalog(bad)).toThrow();
  });

  it("accepts a well-formed fixture with all three tier values present", () => {
    const ok: CrewService[] = [
      makeService({ service_id: "t-free", tier: "free", target_issue_tags: ["indexability"] }),
      makeService({ service_id: "t-pro", tier: "pro", target_issue_tags: ["schema"] }),
      makeService({ service_id: "t-agency", tier: "agency", target_issue_tags: ["citations"] }),
      makeService({ service_id: "t-free-2", tier: "free", target_issue_tags: ["content-depth"] }),
      makeService({ service_id: "t-pro-2", tier: "pro", target_issue_tags: ["ai-visibility"] }),
    ];
    const loaded = loadCrewCatalog(ok);
    expect(loaded.map((s) => s.tier).sort()).toEqual(["agency", "free", "free", "pro", "pro"]);
  });
});
