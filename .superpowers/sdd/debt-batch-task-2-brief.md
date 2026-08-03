## Task 2: B8 — robots parser edge-case tests

**Files:**
- Modify: `packages/seo-core/src/__tests__/robots.test.ts`

**Interfaces:**
- Consumes: `parseRobotsTxt`, `isPathAllowed`, `detectRuleConflicts` (and `detectContradictoryRuleConflicts` after Task 3) from `../robots`
- Produces: nothing (test-only)

- [ ] **Step 1: Add the edge-case tests**

Append the following `describe` blocks to the end of `packages/seo-core/src/__tests__/robots.test.ts`. Add `detectContradictoryRuleConflicts` to the existing import from `../robots` only after Task 3 exports it — for this task, the import stays as-is.

```ts
describe("parseRobotsTxt edge cases", () => {
  it("strips a leading UTF-8 BOM", () => {
    const doc = parseRobotsTxt("\uFEFFUser-agent: *\nDisallow: /private\n");
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("splits CRLF (\\r\\n) line endings", () => {
    const doc = parseRobotsTxt("User-agent: *\r\nDisallow: /a\r\n");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
  });

  it("splits lone CR (\\r) line endings", () => {
    const doc = parseRobotsTxt("User-agent: *\rDisallow: /a\r");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
  });

  it("strips inline # comments on rule lines", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow: /admin # keep out\n");
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/admin");
  });

  it("records a parseError for a line without a colon", () => {
    const doc = parseRobotsTxt("User-agent: *\nthis-has-no-colon\n");
    expect(doc.parseErrors.length).toBe(1);
    expect(doc.parseErrors[0]).toMatch(/geçersiz alan/);
  });

  it("records a parseError for a rule before any user-agent", () => {
    const doc = parseRobotsTxt("Disallow: /secret\nUser-agent: *\n");
    expect(doc.parseErrors.length).toBe(1);
    expect(doc.parseErrors[0]).toMatch(/user-agent olmadan/);
  });

  it("treats empty Allow as a no-op (rule not pushed)", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow:\nDisallow: /x\n");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.type).toBe("disallow");
  });

  it("accumulates multiple User-agent lines into one group", () => {
    const doc = parseRobotsTxt("User-agent: Googlebot\nUser-agent: GPTBot\nDisallow: /both\n");
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0]?.userAgents).toEqual(["googlebot", "gptbot"]);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("is case-insensitive on field names (USER-AGENT)", () => {
    const doc = parseRobotsTxt("USER-AGENT: *\nDISALLOW: /x\n");
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/x");
  });

  it("ignores unknown fields (Crawl-delay, Host) without error", () => {
    const doc = parseRobotsTxt("User-agent: *\nCrawl-delay: 10\nHost: example.com\nDisallow: /x\n");
    expect(doc.parseErrors).toHaveLength(0);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("skips an empty Sitemap value", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nSitemap:\n");
    expect(doc.sitemaps).toHaveLength(0);
  });
});

describe("isPathAllowed tie-break", () => {
  it("allow wins when Allow and Disallow patterns have equal length", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
    expect(isPathAllowed(doc, "Googlebot", "/x")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they pass against the existing parser**

Run: `pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts`
Expected: PASS — all existing + 12 new tests green. If any test FAILS, the parser has a real bug; fix it in `packages/seo-core/src/robots.ts` in the same task (red→green), and note the fix in the commit message.

- [ ] **Step 3: Run the full seo-core suite**

Run: `pnpm --filter @seovista/seo-core test`
Expected: PASS (count increases by 12).

- [ ] **Step 4: Commit**

```bash
git add packages/seo-core/src/__tests__/robots.test.ts
git commit -m "test(seo-core): cover robots parser edge cases (B8)

Add 12 edge-case tests: BOM, CRLF/CR endings, inline comments, colon-less
lines, rule-before-UA, empty Allow, multi-UA groups, field case-insensitivity,
unknown fields, empty sitemap, allow-wins tie-break."
```

---


