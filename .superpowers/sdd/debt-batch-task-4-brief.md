## Task 4: M1(b) — validation-coded unknown-tool error

**Files:**
- Modify: `apps/worker/src/processors/crew-report.ts`
- Modify: `apps/worker/src/__tests__/crew-report-processor.test.ts`

**Interfaces:**
- Consumes: `validationCrewReportError` (already defined in `crew-report.ts:293`)

- [ ] **Step 1: Write the failing test**

In `apps/worker/src/__tests__/crew-report-processor.test.ts`, add a new test case (inside the existing top-level `describe` or a new one — match the file's style):

```ts
it("buildCrewReportRequest throws a validation-coded error for an unknown tool", () => {
  expect(() =>
    buildCrewReportRequest({ tool: "bogus" as never, sourcePayload: {}, sourceTarget: undefined }),
  ).toThrow(/Unknown crew report tool/);

  try {
    buildCrewReportRequest({ tool: "bogus" as never, sourcePayload: {}, sourceTarget: undefined });
  } catch (err) {
    expect((err as Error & { code?: string }).code).toBe("validation.crew_report");
  }
});
```

Ensure `buildCrewReportRequest` is imported from `../processors/crew-report.js` (add to existing imports if not already).

- [ ] **Step 2: Run the test to verify it fails**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-processor.test.ts
```
Expected: FAIL — the thrown error has no `.code` property (it is a plain `Error`).

- [ ] **Step 3: Fix the throw**

In `apps/worker/src/processors/crew-report.ts`, find the unknown-tool throw inside `buildCrewReportRequest` (~line 94):

```ts
  if (!isCrewReportTool(tool)) {
    throw new Error(`Unknown crew report tool: ${String(tool)}`);
  }
```

Replace with:

```ts
  if (!isCrewReportTool(tool)) {
    // Validation-coded so the worker's terminal-status mapper treats this as
    // 'permanent' (an unknown tool will never become valid on retry).
    throw validationCrewReportError(`Unknown crew report tool: ${String(tool)}`);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @seovista/worker test -- src/__tests__/crew-report-processor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/processors/crew-report.ts apps/worker/src/__tests__/crew-report-processor.test.ts
git commit -m "fix(crew-report): validation-coded unknown-tool error (M1b)

buildCrewReportRequest now throws validationCrewReportError for an unknown
tool so the worker maps it to 'permanent' instead of retryable 'failed'."
```

---


