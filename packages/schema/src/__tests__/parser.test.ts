import { describe, it, expect } from "vitest";
import {
  buildOrganization,
  buildWebSite,
  buildWebPage,
  buildService,
  buildBreadcrumbList,
  buildGraph,
  renderGraph,
  organizationId,
  websiteId,
  type SchemaGraph,
} from "../index.js";
import { makePage, makeService, makeOrganization } from "./fixtures.js";

const siteUrl = "https://seovista.com";

function parseJsonLd(scriptContent: string): SchemaGraph {
  const parsed = JSON.parse(scriptContent) as SchemaGraph;
  if (parsed["@context"] !== "https://schema.org") {
    throw new Error("Missing or invalid @context");
  }
  if (!Array.isArray(parsed["@graph"]) || parsed["@graph"].length === 0) {
    throw new Error("Missing or empty @graph");
  }
  return parsed;
}

function collectIds(graph: SchemaGraph): string[] {
  return graph["@graph"].map((node) => node["@id"] as string | undefined).filter(Boolean) as string[];
}

describe("schema JSON-LD parser", () => {
  it("parses a rendered graph with @context and @graph", () => {
    const org = buildOrganization(siteUrl, makeOrganization());
    const graph = buildGraph([org]);
    const rendered = renderGraph(graph);
    const parsed = parseJsonLd(rendered);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toHaveLength(1);
  });

  it("reports stable Organization and WebSite IDs", () => {
    const org = buildOrganization(siteUrl, makeOrganization());
    const website = buildWebSite(siteUrl, { name: "SeoVista" });
    const graph = buildGraph([org, website]);
    const ids = collectIds(graph);
    expect(ids).toContain(organizationId(siteUrl));
    expect(ids).toContain(websiteId(siteUrl));
  });

  it("detects no duplicate IDs in a valid graph", () => {
    const page = makePage({
      title: "GEO",
      description: "GEO readiness.",
      canonical: { path: "/geo/", absolute: `${siteUrl}/geo/` },
    });
    const service = makeService({
      name: "GEO",
      description: "GEO readiness.",
      canonical: { path: "/geo/", absolute: `${siteUrl}/geo/` },
    });
    const org = buildOrganization(siteUrl, makeOrganization());
    const website = buildWebSite(siteUrl, { name: "SeoVista" });
    const webPage = buildWebPage({ page, siteUrl });
    const serviceNode = buildService({
      service,
      siteUrl,
      organizationId: organizationId(siteUrl),
    });
    const breadcrumb = buildBreadcrumbList({
      items: [
        { name: "Home", path: "/" },
        { name: "GEO", path: "/geo/" },
      ],
      siteUrl,
    });
    const graph = buildGraph([org, website, webPage, serviceNode, breadcrumb]);
    const ids = collectIds(graph);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("fails to parse invalid JSON-LD", () => {
    expect(() => parseJsonLd("not-json")).toThrow();
  });

  it("fails to parse graph without @context", () => {
    expect(() => parseJsonLd('{"@graph": []}')).toThrow(/@context/);
  });
});
