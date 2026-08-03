## Task 6: M5 — logger injection

**Files:**
- Create: `apps/worker/src/utils/logger.ts`
- Modify: `apps/worker/src/db/admin-seed.ts`
- Modify: `apps/worker/src/db/dev-seed.ts`
- Modify: `apps/worker/src/utils/fetcher.ts`

**Interfaces:**
- Produces: `Logger` type, `stdoutLogger`, `noopLogger` from `apps/worker/src/utils/logger.ts`

- [ ] **Step 1: Create the logger utility**

Create `apps/worker/src/utils/logger.ts`:

```ts
/**
 * Injected logger contract for CLI scripts and worker diagnostics.
 *
 * The ESLint `no-console` rule (`allow: ["error", "warn"]`) flags every
 * `console.log` call site. Instead of scattering `eslint-disable` comments,
 * every call site injects a `Logger` and the single sanctioned `console.log`
 * lives here in {@link stdoutLogger}. Tests inject {@link noopLogger} or a
 * `vi.fn()` to assert/suppress output.
 */
export type Logger = (...values: unknown[]) => void;

// eslint-disable-next-line no-console -- single sanctioned stdout wrapper; all
// other call sites inject a Logger so the no-console rule stays clean.
export const stdoutLogger: Logger = (...values) => {
  console.log(...values);
};

export const noopLogger: Logger = () => {};
```

- [ ] **Step 2: Update admin-seed.ts default logger**

In `apps/worker/src/db/admin-seed.ts`:

1. Add the import (near the top, after the existing imports):

```ts
import { stdoutLogger, type Logger } from "../utils/logger.js";
```

2. Change the `logger` type in `LocalAdminBootstrapDependencies` from `logger?: (...values: unknown[]) => void;` to:

```ts
  logger?: Logger;
```

3. Change the default at ~line 124:

```ts
  const logger = dependencies.logger ?? stdoutLogger;
```

- [ ] **Step 3: Update dev-seed.ts**

In `apps/worker/src/db/dev-seed.ts`:

1. Add the import after the existing imports:

```ts
import { stdoutLogger, type Logger } from "../utils/logger.js";
```

2. Change the `main` function signature to accept a logger:

```ts
async function main(logger: Logger = stdoutLogger) {
```

3. Replace every `console.log(...)` call inside `main` with `logger(...)`. There are 11 occurrences:
   - `console.log(\`Connecting to database at ${connectionString}...\`);` → `logger(\`Connecting to database at ${connectionString}...\`);`
   - `console.log("Database connection successful.");` → `logger("Database connection successful.");`
   - `console.log(\`Inserted admin: ${adminEmail}\`);` → `logger(\`Inserted admin: ${adminEmail}\`);`
   - `console.log(\`Admin ${adminEmail} already exists. Skipping.\`);` → `logger(\`Admin ${adminEmail} already exists. Skipping.\`);`
   - `console.log(\`Inserted published insight: ${insight.slug}\`);` → `logger(\`Inserted published insight: ${insight.slug}\`);`
   - `console.log(\`Insight ${insight.slug} already exists. Skipping.\`);` → `logger(\`Insight ${insight.slug} already exists. Skipping.\`);`
   - `console.log(\`Inserted finished lead: ${finishedLead.domain}\`);` → `logger(\`Inserted finished lead: ${finishedLead.domain}\`);`
   - `console.log(\`Finished lead completed-lead.local already exists. Skipping.\`);` → `logger(\`Finished lead completed-lead.local already exists. Skipping.\`);`
   - `console.log(\`Inserted abandoned lead: ${abandonedLead.domain}\`);` → `logger(\`Inserted abandoned lead: ${abandonedLead.domain}\`);`
   - `console.log(\`Abandoned lead abandoned-lead.local already exists. Skipping.\`);` → `logger(\`Abandoned lead abandoned-lead.local already exists. Skipping.\`);`
   - `console.log("Seeding complete.");` → `logger("Seeding complete.");`

4. Leave the two `console.error` calls in the `catch`/`finally` and the bottom `main().catch` as-is (allowed by the ESLint config).

- [ ] **Step 4: Update fetcher.ts**

In `apps/worker/src/utils/fetcher.ts`:

1. Add the import after the existing imports (near the top, after `import { getDailyCreditStatus } from "./credit-guard.js";`):

```ts
import { stdoutLogger, type Logger } from "./logger.js";
```

2. Add `logger` to the `FetchAndParseUrlOptions` interface:

```ts
export interface FetchAndParseUrlOptions {
  forceAudit?: boolean;
  /** Injected stdout logger; defaults to the sanctioned stdoutLogger. */
  logger?: Logger;
}
```

3. Inside `fetchAndParseUrlWithMeta`, resolve the logger from options near the top of the function (after `const forceAudit = ...`):

```ts
  const logger = options.logger ?? stdoutLogger;
```

4. Replace the two `console.log(...)` calls with `logger(...)`:
   - The `render_cache_hit` JSON event (~line 700): `console.log(JSON.stringify({...}))` → `logger(JSON.stringify({...}))`
   - The `render_cache_miss` JSON event (~line 748): `console.log(JSON.stringify({...}))` → `logger(JSON.stringify({...}))`

5. Leave all `console.warn(...)` calls as-is (allowed by the ESLint config).

- [ ] **Step 5: Run lint to verify 0 warnings**

Run: `pnpm --filter @seovista/worker lint`
Expected: 0 errors, **0 warnings** (down from 14 `no-console` warnings). If any warning remains, find the remaining `console.log` call site and route it through the logger.

- [ ] **Step 6: Run worker tests to verify behavior is preserved**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test
```
Expected: PASS — the `admin-bootstrap.test.ts` suite (which injects its own `logger`) stays green; no test relied on `console.log` being called directly.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @seovista/worker typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/utils/logger.ts apps/worker/src/db/admin-seed.ts apps/worker/src/db/dev-seed.ts apps/worker/src/utils/fetcher.ts
git commit -m "refactor(worker): inject logger, remove 14 no-console warnings (M5)

Add utils/logger.ts (stdoutLogger + noopLogger). admin-seed/dev-seed/fetcher
inject a Logger instead of calling console.log directly. Behavior preserved;
worker lint now reports 0 warnings."
```

---


