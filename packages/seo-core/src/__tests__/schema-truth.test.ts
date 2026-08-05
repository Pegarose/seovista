import { describe, expect, it } from "vitest";
import {
  normalizeForTruthMatch,
  verifySchemaTruth,
} from "../schema-truth";

describe("normalizeForTruthMatch", () => {
  it("collapses whitespace, lowercases and strips punctuation", () => {
    expect(normalizeForTruthMatch("  SeoVista — Global GEO!\n")).toBe(
      "seovista global geo",
    );
  });

  it("strips accents so diacritic-bearing text matches", () => {
    expect(normalizeForTruthMatch("İstanbul'da ölçüm")).toBe("istanbul da olcum");
  });
});

describe("verifySchemaTruth", () => {
  it("returns a perfect score when there are no claims to check", () => {
    const result = verifySchemaTruth([], "any page text");
    expect(result).toEqual({
      kind: "schema-truth",
      score: 100,
      totalClaims: 0,
      verifiedClaims: 0,
      notVerifiableClaims: 0,
      findings: [],
    });
  });

  it("verifies Organization claims that visibly appear on the page", () => {
    const nodes = [
      {
        "@type": "Organization",
        name: "SeoVista",
        legalName: "SeoVista LTD",
        url: "https://seovista.com/",
        sameAs: ["https://www.linkedin.com/company/seovista"],
      },
    ];
    const pageText =
      "SeoVista (legal: SeoVista LTD) at https://seovista.com/ also at https://www.linkedin.com/company/seovista";
    const result = verifySchemaTruth(nodes, pageText);
    expect(result.verifiedClaims).toBe(4);
    expect(result.notVerifiableClaims).toBe(0);
    expect(result.score).toBe(100);
    expect(result.findings.every((f) => f.status === "verified")).toBe(true);
  });

  it("flags claims that are not visible on the page as not_verifiable", () => {
    const nodes = [
      {
        "@type": "Organization",
        name: "SeoVista",
      },
    ];
    const result = verifySchemaTruth(nodes, "completely unrelated body copy");
    expect(result.verifiedClaims).toBe(0);
    expect(result.notVerifiableClaims).toBe(1);
    expect(result.score).toBe(0);
    expect(result.findings[0]).toEqual({
      field: "name",
      value: "SeoVista",
      status: "not_verifiable",
    });
  });

  it("extracts Article headline + description and Product offer price/currency", () => {
    const nodes = [
      {
        "@type": "Article",
        headline: "Why LLM visibility matters",
        description: "An explanation of how answer engines cite sources",
      },
      {
        "@type": "Product",
        name: "Breadcrumbs",
        offers: { price: "19.90", priceCurrency: "EUR" },
      },
    ];
    const pageText =
      "Why LLM visibility matters An explanation of how answer engines cite sources Breadcrumbs 19.90 EUR";
    const result = verifySchemaTruth(nodes, pageText);
    expect(result.totalClaims).toBe(5);
    expect(result.verifiedClaims).toBe(5);
    expect(result.findings.map((f) => f.field)).toContain("offers.price");
  });

  it("fails fabricated rating/review claims that never appear on the page", () => {
    const nodes = [
      {
        "@type": "Product",
        name: "Breadcrumbs",
        ratingValue: "4.9",
        reviewCount: "321",
      },
    ];
    const pageText = "Breadcrumbs is a great product. Trusted daily.";
    const result = verifySchemaTruth(nodes, pageText);
    expect(result.totalClaims).toBe(3);
    expect(result.verifiedClaims).toBe(1);
    expect(result.notVerifiableClaims).toBe(2);
    expect(result.findings.find((f) => f.field === "ratingValue")?.status).toBe(
      "not_verifiable",
    );
    expect(Math.round(result.score)).toBe(Math.round((1 / 3) * 100));
  });

  it("accepts @type as an array without double-counting shared claims", () => {
    const nodes = [
      {
        "@type": ["Article", "BlogPosting"],
        headline: "Zone 2 migration notes",
      },
    ];
    const result = verifySchemaTruth(nodes, "zone 2 migration notes on this page");
    // Article, BlogPosting share headline — de-duplicated so single scheme
    // single page claim.
    expect(result.totalClaims).toBe(1);
    expect(result.findings.every((f) => f.status === "verified")).toBe(true);
  });

  it("ignores untyped nodes and non-string leaf claims", () => {
    const nodes = [
      { name: "Untyped" },
      {
        "@type": "Organization",
        name: { "@value": "weird object" },
      },
    ];
    const result = verifySchemaTruth(nodes, "anything");
    expect(result.totalClaims).toBe(0);
  });
});
