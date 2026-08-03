# Debt Batch Task 3 — M1(a) Conflict-Detector Deduplication

## Scope

Implemented only M1(a): extracted and exported the narrow same-pattern Allow/Disallow contradiction detector from `@seovista/seo-core`, made `detectRuleConflicts` reuse it, and replaced the duplicate worker implementation with the shared helper. Existing conflict output and worker scoring behavior are preserved.

## Implementation

- Added `detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[]` to `packages/seo-core/src/robots.ts`.
- Re-exported `detectContradictoryRuleConflicts` from `packages/seo-core/src/index.ts`.
- Refactored `detectRuleConflicts` to initialize its result from the shared helper, retaining the wildcard-policy conflict logic unchanged.
- Deleted `findContradictoryRuleConflicts` from `apps/worker/src/processors/ai-crawler-audit.ts` and imported/called the shared helper.
- Added focused tests for same-pattern contradictions and exclusion of wildcard-policy-vs-UA-full-block conflicts from the narrow helper.

## Validation

Focused seo-core robots tests:

```text
pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts
PASS — 1 test file, 22 tests
```

Worker AI-crawler processor tests, with the required lifecycle context:

```text
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\\bc-proje\\Seovista\\.lifecycle-evidence\\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/ai-crawler-audit-processor.test.ts
PASS — 1 test file, 3 tests
```

The first worker test invocation stopped in its pretest build because the workspace `@seovista/seo-core` dist declarations predated this export. Rebuilding seo-core and rerunning the required command passed; this is a local generated-artifact synchronization issue, not a source failure.

Package typechecks:

```text
pnpm --filter @seovista/seo-core typecheck
PASS
pnpm --filter @seovista/worker typecheck
PASS
```

Additional checks:

- `pnpm --filter @seovista/seo-core build` passed.
- Assigned diff reviewed; no unrelated source files changed.
- Duplicate worker helper no longer exists.
- Diff whitespace check was reviewed with the repository's existing CRLF format in `packages/seo-core/src/index.ts`; no substantive whitespace issue was introduced.

## Self-review

The narrow helper preserves the prior worker loop and exact Turkish description/line output. `detectRuleConflicts` now delegates only the same-pattern contradiction subset, while wildcard-vs-specific-agent full-block detection remains in the full detector. The added test confirms this boundary. No M1(b), M2, M5, or unrelated behavior was changed. The environment reports Node v25.8.0 while the repository requests Node >=24.0.0 <25.0.0; all requested validations passed despite the existing engine warning.

## Changed assigned files

- `packages/seo-core/src/robots.ts`
- `packages/seo-core/src/index.ts`
- `packages/seo-core/src/__tests__/robots.test.ts`
- `apps/worker/src/processors/ai-crawler-audit.ts`

This report and all other pre-existing working-tree changes are intentionally not part of the assigned commit.
