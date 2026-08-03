# Debt Batch Task 2 — B8 Robots Parser Edge-Case Coverage

## Scope

Implemented only B8 in `packages/seo-core/src/__tests__/robots.test.ts`. Added the 12 requested characterization tests covering robots parsing edge cases and equal-length Allow/Disallow tie-breaking. `packages/seo-core/src/robots.ts` was not changed because the existing parser passed every new case.

## RED/GREEN evidence

The requested characterization cases were added against the existing implementation. No parser defect was exposed, so there was no failing RED run requiring a production fix; the first focused execution was already GREEN. This is expected for characterization coverage of behavior already present in the parser.

Focused command:

```text
pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts
```

Result:

```text
PASS
Test Files  1 passed (1)
Tests       20 passed (20)
```

The robots file had 8 tests before B8 and has 20 after B8, an increase of 12 tests.

## Full suite evidence

Command:

```text
pnpm --filter @seovista/seo-core test
```

Result:

```text
PASS
Test Files  10 passed (10)
Tests       121 passed (121)
```

The run emitted the existing Node engine warning because the environment uses Node v25.8.0 while the repository requests Node >=24.0.0 <25.0.0; it did not affect test results.

## Changed files

- `packages/seo-core/src/__tests__/robots.test.ts`

No production parser change was needed. Existing unrelated working-tree changes were preserved and no scratch report or `apps/web/tsconfig.json` file was staged.
