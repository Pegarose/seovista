import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { createServer } from "node:http";
import { mapEntity, createAdapter } from "@seovista/content-models";
import type { MapOptions } from "@seovista/content-models";
import { startServer, checkNextgHealth, buildCollectionResponse, allFixtures, isRegisteredCollection } from "../index.js";

describe("nextg mock server", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    server = startServer(0);
    await new Promise<void>((resolve) => {
      server.once("listening", () => {
        const address = server.address();
        port = typeof address === "object" && address ? address.port : 3101;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  async function fetchJson(path: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`http://localhost:${port}${path}`);
    const text = await res.text();
    return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
  }

  it("health endpoint returns 200", async () => {
    const { status, body } = await fetchJson("/health");
    expect(status).toBe(200);
    expect((body as { name: string }).name).toBe("@seovista/nextg");
  });

  it("returns 200 for registered collections", async () => {
    const collections = [
      "pages",
      "services",
      "tools",
      "articles",
      "authors",
      "organizations",
      "researchReports",
      "definitions",
      "faqs",
      "sources",
      "redirects",
      "locales",
      "auditLeads",
    ];
    for (const collection of collections) {
      const { status, body } = await fetchJson(`/api/${collection}?mode=public&locale=en`);
      expect(status).toBe(200);
      expect((body as { collection: string }).collection).toBe(collection);
      expect((body as { mode: string }).mode).toBe("public");
    }
  });

  it("returns typed error for unknown collection", async () => {
    const { status, body } = await fetchJson("/api/unknownCollection");
    expect(status).toBe(404);
    expect((body as { code: string }).code).toBe("UNKNOWN_COLLECTION");
  });

  it("returns deferred error for case studies", async () => {
    const { status, body } = await fetchJson("/api/caseStudies");
    expect(status).toBe(422);
    expect((body as { code: string }).code).toBe("DEFERRED_COLLECTION");
  });

  it("filters draft items in public mode", async () => {
    const { status, body } = await fetchJson("/api/pages?mode=public&locale=en");
    expect(status).toBe(200);
    const items = (body as { items: { provenance: { status: string } }[] }).items;
    expect(items.some((item) => item.provenance.status === "draft")).toBe(false);
    expect(items.some((item) => item.provenance.status === "preview")).toBe(false);
  });

  it("includes draft and preview items in preview mode", async () => {
    const { status, body } = await fetchJson("/api/pages?mode=preview&locale=en");
    expect(status).toBe(200);
    const items = (body as { items: { provenance: { status: string } }[] }).items;
    expect(items.some((item) => item.provenance.status === "draft")).toBe(true);
    expect(items.some((item) => item.provenance.status === "preview")).toBe(true);
  });

  it("produces byte-stable responses across repeated reads", async () => {
    const a = await fetchJson("/api/pages?mode=public&locale=en");
    const b = await fetchJson("/api/pages?mode=public&locale=en");
    expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
  });
});

describe("nextg fixtures", () => {
  it("covers all 13 registered collections", () => {
    const collections = [
      "pages",
      "services",
      "tools",
      "articles",
      "authors",
      "organizations",
      "researchReports",
      "definitions",
      "faqs",
      "sources",
      "redirects",
      "locales",
      "auditLeads",
    ];
    for (const collection of collections) {
      expect(isRegisteredCollection(collection)).toBe(true);
      const items = allFixtures.filter((item) => item.collection === collection);
      expect(items.length).toBeGreaterThan(0);
    }
  });

  it("sorts items by id deterministically", () => {
    const response = buildCollectionResponse("pages", "public", "en", "2026-07-01T00:00:00.000Z");
    const ids = response.items.map((item) => item.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it("health check reports live and ready", () => {
    const report = checkNextgHealth();
    expect(report.liveness).toBe("live");
    expect(report.readiness).toBe("ready");
  });

  it("fixtures map through content-models mapper", () => {
    const mapOptions: MapOptions = {
      trustedSiteUrl: "https://seovista.com",
      mode: { kind: "public", now: new Date("2026-07-01T00:00:00Z") },
      supportedLocales: ["en"],
      defaultLocale: "en",
    };
    const outcomes = allFixtures.map((item) => mapEntity(item, mapOptions));
    const successes = outcomes.filter((o) => o.success);
    const failures = outcomes.filter((o) => !o.success);
    expect(successes.length).toBeGreaterThan(0);
    if (failures.length > 0) {
      const reasons = failures.map((f, index) => {
        if (f.success) return "";
        const item = allFixtures[index];
        return item ? `${item.collection}/${item.id} -> ${f.field}: ${f.reason}` : `index ${index}: ${f.field}: ${f.reason}`;
      }).join("; ");
      throw new Error(`Mapping failures: ${reasons}`);
    }

    const entities = successes.flatMap((o) => (o.success ? [o.value] : []));
    const adapter = createAdapter(entities, mapOptions);
    const publicContent = adapter.readContent("html");
    expect(publicContent.length).toBeGreaterThan(0);
  });
});
