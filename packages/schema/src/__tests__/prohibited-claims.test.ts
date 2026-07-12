import { describe, it, expect } from "vitest";
import type { FAQ } from "@seovista/content-models";
import {
  buildOrganization,
  buildWebPage,
  buildService,
  buildWebApplication,
  buildFAQPage,
  buildGraph,
  SchemaValidationError,
} from "../index.js";
import {
  makePage,
  makeService,
  makeTool,
  makeFAQ,
  makeOrganization,
} from "./fixtures.js";

const siteUrl = "https://seovista.com";

describe("schema prohibited-claim rejection", () => {
  it("rejects Organization with fabricated aggregateRating", () => {
    const org = {
      ...makeOrganization(),
      aggregateRating: { ratingValue: 5, reviewCount: 100 },
    };
    expect(() => buildOrganization(siteUrl, org)).toThrow(SchemaValidationError);
  });

  it("rejects Organization with fabricated review", () => {
    const org = {
      ...makeOrganization(),
      review: { author: "fake", reviewRating: 5 },
    };
    expect(() => buildOrganization(siteUrl, org)).toThrow(SchemaValidationError);
  });

  it("rejects Organization with fabricated awards", () => {
    const org = {
      ...makeOrganization(),
      awards: ["Best GEO Tool 2026"],
    };
    expect(() => buildOrganization(siteUrl, org)).toThrow(SchemaValidationError);
  });

  it("rejects Service with fabricated customerCount", () => {
    const service = {
      ...makeService(),
      customerCount: 1000,
    };
    expect(() =>
      buildService({ service, siteUrl, organizationId: "https://seovista.com/#organization" }),
    ).toThrow(SchemaValidationError);
  });

  it("rejects Service with fabricated dataset", () => {
    const service = {
      ...makeService(),
      dataset: { name: "Fake dataset" },
    };
    expect(() =>
      buildService({ service, siteUrl, organizationId: "https://seovista.com/#organization" }),
    ).toThrow(SchemaValidationError);
  });

  it("rejects WebPage with fabricated guarantee", () => {
    const page = {
      ...makePage(),
      guarantee: "#1 ranking guarantee",
    };
    expect(() => buildWebPage({ page, siteUrl })).toThrow(SchemaValidationError);
  });

  it("rejects non-functioning tool as WebApplication", () => {
    const tool = makeTool({ isFunctioning: false });
    expect(() =>
      buildWebApplication({
        tool,
        siteUrl,
        organizationId: "https://seovista.com/#organization",
      }),
    ).toThrow(/functioning/);
  });

  it("rejects empty FAQ list for FAQPage", () => {
    expect(() =>
      buildFAQPage({ faqs: [], pageUrl: "https://seovista.com/faq/", siteUrl }),
    ).toThrow();
  });

  it("rejects FAQPage with hidden FAQ content", () => {
    const faq = makeFAQ({ hiddenFAQ: "hidden" } as unknown as Partial<FAQ>);
    expect(() =>
      buildFAQPage({ faqs: [faq], pageUrl: "https://seovista.com/faq/", siteUrl }),
    ).toThrow(SchemaValidationError);
  });

  it("graph contains no unsupported metrics or fabricated data", () => {
    const org = buildOrganization(siteUrl, makeOrganization());
    const graph = buildGraph([org]);
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("AggregateRating");
    expect(serialized).not.toContain("reviewCount");
    expect(serialized).not.toContain("customerCount");
    expect(serialized).not.toContain("dataset");
    expect(serialized).not.toContain("award");
  });
});
