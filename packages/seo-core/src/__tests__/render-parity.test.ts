import { describe, expect, it } from "vitest";
import {
  compareRenderSides,
  extractVisibleText,
  parseRenderSide,
} from "../render-parity";

describe("extractVisibleText", () => {
  it("strips scripts, styles, comments and html tags", () => {
    const html =
      "<!doctype html><html><body><!-- c --><script>var x=1;</script><style>body{}</style><p>Hello <b>world</b>!</p></body></html>";
    expect(extractVisibleText(html)).toBe("Hello world !");
  });

  it("decodes common entities", () => {
    expect(extractVisibleText("<p>Tom &amp; Jerry&nbsp;forever</p>")).toBe("Tom & Jerry forever");
  });
});

describe("parseRenderSide", () => {
  it("captures title, meta, canonical, h1/h2 and token count", () => {
    const html = `<!doctype html><html><head>
      <title>Zone</title>
      <meta name="description" content="Zone overview">
      <link rel="canonical" href="https://example.com/zone">
    </head><body><h1>Zone</h1><h2>Sub</h2><p>Hello world</p></body></html>`;
    const side = parseRenderSide(html, { url: "https://example.com/zone", status: 200 });
    expect(side.title).toBe("Zone");
    expect(side.metaDescription).toBe("Zone overview");
    expect(side.canonical).toBe("https://example.com/zone");
    expect(side.h1).toEqual(["Zone"]);
    expect(side.h2).toEqual(["Sub"]);
    expect(side.tokenCount).toBeGreaterThan(0);
  });
});

describe("compareRenderSides", () => {
  it("scores 100 for identical sides", () => {
    const html = `<!doctype html><html><head><title>Zone</title><meta name="description" content="x">
      <link rel="canonical" href="https://example.com/"></head><body><h1>Zone</h1><p>Hi there</p></body></html>`;
    const a = parseRenderSide(html, { url: "https://example.com/", status: 200 });
    const b = parseRenderSide(html, { url: "https://example.com/", status: 200 });
    const result = compareRenderSides(a, b);
    expect(result.score).toBe(100);
    expect(result.renderedParityRatio).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it("flags h1 and title that exist only on one side", () => {
    const defaultHtml = `<!doctype html><html><head><title>Zone</title></head><body><h1>Zone</h1><p>body</p></body></html>`;
    const crawlerHtml = `<!doctype html><html><head><title>Different</title></head><body><p>body</p></body></html>`;
    const defaultSide = parseRenderSide(defaultHtml, { url: "https://example.com/", status: 200 });
    const crawlerSide = parseRenderSide(crawlerHtml, { url: "https://example.com/", status: 200 });
    const result = compareRenderSides(defaultSide, crawlerSide);
    expect(result.h1OnlyInDefault).toEqual(["Zone"]);
    expect(result.h1OnlyInCrawler).toEqual([]);
    expect(result.issues.some((i) => i.field === "h1")).toBe(true);
    expect(result.issues.some((i) => i.field === "title")).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it("flags empty crawler body as an error and collapses parity ratio", () => {
    const defaultHtml = `<!doctype html><html><head><title>P</title></head><body><h1>Hi</h1><p>lots of visible text</p></body></html>`;
    const crawlerHtml = `<!doctype html><html><head><title>P</title></head><body><script>app()</script></body></html>`;
    const defaultSide = parseRenderSide(defaultHtml, { url: "https://example.com/", status: 200 });
    const crawlerSide = parseRenderSide(crawlerHtml, { url: "https://example.com/", status: 200 });
    const result = compareRenderSides(defaultSide, crawlerSide);
    // The crawler body collapsed to `` (only a script shell + title), so
    // nothing but the leftover title/meta tokens are comparable.
    expect(result.renderedParityRatio).toBeLessThan(0.25);
    expect(result.issues.some((i) => i.field === "text" && i.severity === "error")).toBe(true);
    expect(result.score).toBeLessThan(60);
  });

  it("flags status divergence", () => {
    const html = "<!doctype html><html><body><p>x</p></body></html>";
    const a = parseRenderSide(html, { url: "https://example.com/", status: 200 });
    const b = parseRenderSide(html, { url: "https://example.com/", status: 403 });
    const result = compareRenderSides(a, b);
    expect(result.issues.some((i) => i.field === "status")).toBe(true);
  });
});
