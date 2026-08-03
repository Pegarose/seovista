# Task 3 Report — Alert Evaluator

## Status

DONE_WITH_CONCERNS

## Summary

Implemented `apps/worker/src/alerts/alert-evaluator.ts` with the pure `evaluateTransition` function and `AlertKind` type as specified in the brief.

## Commit

- Hash: `2c7c27d4b984475b0d7362a102f015f6a66668c0`
- Message: `feat(worker): add tracker alert transition evaluator`
- Files committed: `apps/worker/src/alerts/alert-evaluator.ts`

## Validation

- `pnpm --filter @seovista/worker typecheck` — PASS (exit 0)
- `pnpm --filter @seovista/worker lint` — PASS (exit 0)
- `pnpm --filter @seovista/worker test -- alert-evaluator` — BLOCKED by Docker port conflict (`Bind for 127.0.0.1:8543 failed: port is already allocated` / `8637` on earlier attempt). The worker test global setup requires Docker services that cannot acquire their configured ports in this environment.
- Isolated run of `apps/worker/src/__tests__/alert-evaluator.test.ts` without the Docker global setup — 7/8 tests pass; 1 fails on the custom `minDelta` assertion.

## Test Concern

The existing test file contains an internally inconsistent assertion:

```ts
it("respects a custom minDelta", () => {
  expect(evaluateTransition(1, 5, 5)).toBe("significant_drop");
  expect(evaluateTransition(1, 4, 5)).toBeNull();
});
```

With the brief-specified threshold `next - prev >= minDelta`:

- `evaluateTransition(1, 5, 5)` computes delta `4`, which is **not** `>= 5`, so it returns `null`.
- `evaluateTransition(1, 4, 5)` computes delta `3`, which is also not `>= 5`, so it returns `null` (matching the second assertion).

The default tests establish that the boundary is inclusive:

```ts
expect(evaluateTransition(1, 4, MIN)).toBe("significant_drop"); // delta 3 >= MIN 3
expect(evaluateTransition(1, 3, MIN)).toBeNull();               // delta 2 < MIN 3
```

Therefore the custom `minDelta` assertion appears to be off-by-one: either the first call should be `evaluateTransition(1, 6, 5)` (delta 5) or the `minDelta` should be `4`. I did not modify the test file per task instructions.

## Follow-up test fix

The custom `minDelta` assertion was corrected to align with the spec's inclusive boundary:

```ts
it("respects a custom minDelta", () => {
  expect(evaluateTransition(1, 6, 5)).toBe("significant_drop"); // delta 5 >= 5
  expect(evaluateTransition(1, 4, 5)).toBeNull();               // delta 3 < 5
});
```

### Commit

- Hash: `58ac77b`
- Message: `test(worker): fix off-by-one in alert evaluator custom minDelta test`
- Files committed: `apps/worker/src/__tests__/alert-evaluator.test.ts`

### Final validation

`pnpm --filter @seovista/worker test -- alert-evaluator`:

```
Test Files  1 passed (1)
     Tests  8 passed (8)
  Duration  9.49s
```

`pnpm --filter @seovista/worker typecheck` — PASS (exit 0)
`pnpm --filter @seovista/worker lint` — PASS (exit 0)

## Notes

- The implementation matches the brief exactly (`>= minDelta` threshold for in-band moves).
- The untracked test file `apps/worker/src/__tests__/alert-evaluator.test.ts` was committed with the corrected assertion.
- No scratch files in `.superpowers/sdd/` were committed.
