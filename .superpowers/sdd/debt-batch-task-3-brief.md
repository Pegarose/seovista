## Task 3: M1(a) — conflict-detector dedup

**Files:**
- Modify: `packages/seo-core/src/robots.ts`
- Modify: `packages/seo-core/src/index.ts`
- Modify: `apps/worker/src/processors/ai-crawler-audit.ts`

**Interfaces:**
- Produces: `detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[]` exported from `@seovista/seo-core`

- [ ] **Step 1: Write the failing test for the narrow helper**

In `packages/seo-core/src/__tests__/robots.test.ts`, add `detectContradictoryRuleConflicts` to the import from `../robots`:

```ts
import {
  detectRuleConflicts,
  detectContradictoryRuleConflicts,
  evaluateCrawlerAccess,
  isPathAllowed,
  parseRobotsTxt,
} from "../robots";
```

Append at the end of the file:

```ts
describe("detectContradictoryRuleConflicts", () => {
  it("detects same-pattern allow+disallow in one group", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
    const conflicts = detectContradictoryRuleConflicts(doc);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.description).toContain("/x");
  });

  it("does NOT report the wildcard-policy-vs-UA-full-block conflict (that stays in detectRuleConflicts)", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nUser-agent: GPTBot\nDisallow: /\n");
    expect(detectContradictoryRuleConflicts(doc)).toHaveLength(0);
    // The full detectRuleConflicts DOES report it:
    expect(detectRuleConflicts(doc).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts`
Expected: FAIL — `detectContradictoryRuleConflicts` is not exported.

- [ ] **Step 3: Extract and export the helper in robots.ts**

In `packages/seo-core/src/robots.ts`, replace the existing `detectRuleConflicts` function with a split version. Find the block starting at `const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);` and the `export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {` function. Replace the first half of `detectRuleConflicts` (the same-pattern Allow/Disallow loop) with a call to the new exported helper:

```ts
const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);

/**
 * Detects genuine rule contradictions: the same path carrying both an Allow
 * and a Disallow rule inside one group. This is the narrow, penalty-relevant
 * subset of {@link detectRuleConflicts} — the worker's AI-crawler audit uses
 * it directly so it does not duplicate the logic (M1(a) drift fix).
 */
export function detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  for (const group of doc.groups) {
    const allows = new Set(group.rules.filter((r) => r.type === "allow").map((r) => r.pattern));
    for (const rule of group.rules) {
      if (rule.type === "disallow" && allows.has(rule.pattern)) {
        conflicts.push({
          description: `Aynı yol için hem Allow hem Disallow kuralı tanımlı: ${rule.pattern}`,
          lines: [`user-agent: ${group.userAgents.join(", ")} (satır ${group.line})`],
        });
      }
    }
  }
  return conflicts;
}

export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
  const conflicts: RuleConflict[] = detectContradictoryRuleConflicts(doc);

  const wildcards = doc.groups.filter((g) => g.userAgents.includes("*"));
  const wildcardFullBlock = wildcards.some((g) =>
    g.rules.some((r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern)),
  );
  if (wildcards.length > 0 && !wildcardFullBlock) {
    for (const group of doc.groups) {
      if (group.userAgents.includes("*")) continue;
      const fullBlock = group.rules.some(
        (r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern),
      );
      if (fullBlock) {
        conflicts.push({
          description: `${group.userAgents.join(", ")} için tüm site engellenmiş ancak genel (*) grubu izin veriyor — kasıtlı bir politika değilse çakışmadır`,
          lines: [`satır ${group.line}`],
        });
      }
    }
  }
  return conflicts;
}
```

- [ ] **Step 4: Re-export from index.ts**

In `packages/seo-core/src/index.ts`, add `detectContradictoryRuleConflicts` to the existing robots export block (the one that exports `parseRobotsTxt, robotsPatternMatches, isPathAllowed, evaluateCrawlerAccess, detectRuleConflicts`):

```ts
export {
  parseRobotsTxt,
  robotsPatternMatches,
  isPathAllowed,
  evaluateCrawlerAccess,
  detectRuleConflicts,
  detectContradictoryRuleConflicts,
} from "./robots.js";
```

- [ ] **Step 5: Run seo-core tests to verify the helper + existing detectRuleConflicts pass**

Run: `pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts`
Expected: PASS — the 2 new helper tests + all existing `detectRuleConflicts` tests green.

- [ ] **Step 6: Update the worker processor to use the seo-core helper**

In `apps/worker/src/processors/ai-crawler-audit.ts`:

1. Add `detectContradictoryRuleConflicts` to the import from `@seovista/seo-core`:

```ts
import {
  detectContradictoryRuleConflicts,
  detectRuleConflicts,
  evaluateAllCrawlers,
  parseRobotsTxt,
  type CrawlerCategory,
  type CrawlerAccessStatus,
  type RobotsTxtDocument,
  type RuleConflict,
} from "@seovista/seo-core";
```

2. Delete the entire local `findContradictoryRuleConflicts` function (the function with its doc comment, from `/**\n * Detects genuine rule contradictions...` through its closing `}`).

3. Replace the two call sites of `findContradictoryRuleConflicts(doc)` with `detectContradictoryRuleConflicts(doc)`:
   - `const contradictoryConflicts = found ? findContradictoryRuleConflicts(doc) : [];` → `const contradictoryConflicts = found ? detectContradictoryRuleConflicts(doc) : [];`

- [ ] **Step 7: Run worker ai-crawler processor tests**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/ai-crawler-audit-processor.test.ts
```
Expected: PASS — the processor's behavior is unchanged.

- [ ] **Step 8: Typecheck both packages**

Run:
```powershell
pnpm --filter @seovista/seo-core typecheck
pnpm --filter @seovista/worker typecheck
```
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add packages/seo-core/src/robots.ts packages/seo-core/src/index.ts packages/seo-core/src/__tests__/robots.test.ts apps/worker/src/processors/ai-crawler-audit.ts
git commit -m "refactor: dedup conflict-detector (M1a)

Export detectContradictoryRuleConflicts from seo-core; detectRuleConflicts
uses it internally. Worker ai-crawler-audit imports the helper instead of
duplicating the allow/disallow contradiction loop."
```

---


