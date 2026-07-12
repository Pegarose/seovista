import { describe, it, expect } from "vitest";
import {
  buildOrganization,
  buildWebSite,
  buildWebPage,
  buildService,
  buildPerson,
  buildBlogPosting,
  buildBreadcrumbList,
  buildWebApplication,
  buildFAQPage,
  buildDefinedTerm,
  buildAboutBrand,
  buildGraph,
  organizationId,
  websiteId,
  type SchemaGraph,
} from "../index.js";
import {
  makePage,
  makeService,
  makeTool,
  makeArticle,
  makeAuthor,
  makeOrganization,
  makeDefinition,
  makeFAQ,
} from "./fixtures.js";

const siteUrl = "https://seovista.com";

describe("schema JSON-LD builders", () => {
  it("produces a valid graph with @context", () => {
    const org = buildOrganization(siteUrl, makeOrganization());
    const graph = buildGraph([org]);
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"]).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(graph))).toBeTruthy();
  });

  it("Organization has stable @id and parentOrganization GMedya Group", () => {
    const org = buildOrganization(siteUrl, makeOrganization());
    expect(org["@id"]).toBe("https://seovista.com/#organization");
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("SeoVista");
    expect(org.parentOrganization).toEqual({
      "@type": "Organization",
      name: "GMedya Group",
    });
  });

  it("WebSite has stable @id and references publisher", () => {
    const website = buildWebSite(siteUrl, { name: "SeoVista" });
    expect(website["@id"]).toBe("https://seovista.com/#website");
    expect(website["@type"]).toBe("WebSite");
    expect(website.publisher).toEqual({ "@id": organizationId(siteUrl) });
    expect(website.url).toBe("https://seovista.com");
  });

  it("WebPage URL matches canonical and references WebSite", () => {
    const page = makePage({ canonical: { path: "/about/", absolute: `${siteUrl}/about/` } });
    const node = buildWebPage({ page, siteUrl });
    expect(node["@id"]).toBe("https://seovista.com/about/");
    expect(node.url).toBe("https://seovista.com/about/");
    expect(node.isPartOf).toEqual({ "@id": websiteId(siteUrl) });
    expect(node["@type"]).toBe("WebPage");
    expect(node.name).toBe(page.title);
    expect(node.description).toBe(page.description);
  });

  it("Service node matches visible name and description", () => {
    const service = makeService({ name: "GEO Service", description: "GEO description" });
    const node = buildService({
      service,
      siteUrl,
      organizationId: organizationId(siteUrl),
    });
    expect(node["@type"]).toBe("Service");
    expect(node.name).toBe("GEO Service");
    expect(node.description).toBe("GEO description");
    expect(node.provider).toEqual({ "@id": organizationId(siteUrl) });
  });

  it("Person node matches author name and canonical URL", () => {
    const author = makeAuthor({ name: "Jane Doe" });
    const node = buildPerson({ author, siteUrl });
    expect(node["@type"]).toBe("Person");
    expect(node.name).toBe("Jane Doe");
    expect(node["@id"]).toBe("https://seovista.com/authors/jane-doe/");
  });

  it("BlogPosting requires author evidence", () => {
    const article = makeArticle();
    const author = makeAuthor();
    const person = buildPerson({ author, siteUrl });
    const node = buildBlogPosting({ article, siteUrl, authorPerson: person });
    expect(node["@type"]).toBe("BlogPosting");
    expect(node.headline).toBe(article.title);
    expect(node.author).toEqual(person);
  });

  it("BreadcrumbList positions are contiguous and end at current route", () => {
    const items = [
      { name: "Home", path: "/" },
      { name: "GEO", path: "/geo/" },
    ];
    const node = buildBreadcrumbList({ items, siteUrl });
    const itemListElement = (node.itemListElement as unknown as { position: number; item: string }[] | undefined) ?? [];
    const firstBreadcrumb = itemListElement[0];
    const secondBreadcrumb = itemListElement[1];
    if (!firstBreadcrumb || !secondBreadcrumb) throw new Error("Breadcrumb items expected");
    expect(node["@type"]).toBe("BreadcrumbList");
    expect(itemListElement).toHaveLength(2);
    expect(firstBreadcrumb.position).toBe(1);
    expect(secondBreadcrumb.position).toBe(2);
    expect(secondBreadcrumb.item).toBe("https://seovista.com/geo/");
  });

  it("WebApplication is only emitted for functioning tools", () => {
    const functioningTool = makeTool({ isFunctioning: true, name: "Functioning Tool" });
    const node = buildWebApplication({
      tool: functioningTool,
      siteUrl,
      organizationId: organizationId(siteUrl),
    });
    expect(node["@type"]).toBe("WebApplication");
    expect(node.name).toBe("Functioning Tool");
  });

  it("FAQPage emits exact visible question and answer", () => {
    const faq = makeFAQ({ question: "Q1", answer: "A1" });
    const pageUrl = "https://seovista.com/faq/";
    const node = buildFAQPage({ faqs: [faq], pageUrl, siteUrl });
    const mainEntity = (node.mainEntity as unknown as { name: string; acceptedAnswer: { text: string } }[] | undefined) ?? [];
    const firstFaq = mainEntity[0];
    if (!firstFaq) throw new Error("FAQ item expected");
    expect(node["@type"]).toBe("FAQPage");
    expect(mainEntity).toHaveLength(1);
    expect(firstFaq.name).toBe("Q1");
    expect(firstFaq.acceptedAnswer.text).toBe("A1");
    expect(node["@id"]).toBe(`${pageUrl}#faq`);
  });

  it("DefinedTerm emits term and definition", () => {
    const definition = makeDefinition({ term: "GEO", definition: "Generative Engine Optimization" });
    const node = buildDefinedTerm({ definition, siteUrl });
    expect(node["@type"]).toBe("DefinedTerm");
    expect(node.name).toBe("GEO");
    expect(node.description).toBe("Generative Engine Optimization");
  });

  it("About brand has stable @id and references organization", () => {
    const org = makeOrganization();
    const node = buildAboutBrand({
      organization: org,
      siteUrl,
      organizationId: organizationId(siteUrl),
    });
    expect(node["@id"]).toBe("https://seovista.com/about/#brand");
    expect(node["@type"]).toBe("Brand");
    expect(node.parentOrganization).toEqual({ "@id": organizationId(siteUrl) });
  });
});

describe("schema snapshots", () => {
  it("matches a full launch-route graph snapshot", () => {
    const org = buildOrganization(siteUrl, makeOrganization());
    const website = buildWebSite(siteUrl, { name: "SeoVista" });
    const page = makePage({
      title: "GEO Readiness",
      description: "Understand GEO readiness.",
      canonical: { path: "/geo/", absolute: `${siteUrl}/geo/` },
    });
    const service = makeService({
      name: "GEO Readiness",
      description: "Understand GEO readiness.",
      canonical: { path: "/geo/", absolute: `${siteUrl}/geo/` },
    });
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
    const graph: SchemaGraph = buildGraph([org, website, webPage, serviceNode, breadcrumb]);
    expect(graph).toMatchSnapshot();
  });
});
