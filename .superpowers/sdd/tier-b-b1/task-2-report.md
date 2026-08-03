# Task 2 Report: Tracker Repository

## Status: DONE

## What I Implemented

A typed DB CRUD repository for the Tier B B1 recurring keyword rank tracker, following the existing `createGeoAuditRepository` pattern. The module exposes `createTrackerRepository(client: DbClient)` returning an object with 9 async methods operating on the three tables created by migration 015 (`tracker_sessions`, `keyword_targets`, `rank_observations`).

### Methods
- `findOrCreateSession(email)` — SELECT-then-INSERT with race fallback on UNIQUE(email)
- `createTarget(input)` — INSERT ... RETURNING id (UNIQUE constraint surfaces duplicate errors)
- `countActiveTargets(sessionId)` — COUNT(*) with `active = true` filter
- `listActiveTargets()` — cross-session list ordered by `last_checked_at NULLS FIRST, created_at ASC`
- `insertObservation(input)` — INSERT with `top_competitors` cast to `jsonb`
- `updateLastCheckedAt(targetId)` — sets `last_checked_at = now()`
- `listTargetsByToken(token)` — joins `tracker_sessions`, fetches up to 7 recent observations per target ordered DESC
- `deactivateTarget(token, targetId)` — ownership-scoped UPDATE; returns `rowCount > 0`
- `findSessionByToken(token)` — returns `{ id, email }` or `null`

## TDD Evidence

### RED
Command:
```
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH = 'C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-repository.test.ts
```
Result (exit 1):
```
Error: Cannot find module '../db/tracker-repository.js' imported from
'C:/bc-proje/Seovista/apps/worker/src/__tests__/tracker-repository.test.ts'
 Test Files  1 failed (1)
      Tests  no tests
```

### GREEN
Same command after implementing `tracker-repository.ts` and adding the `db/index.ts` export:
```
 ✓ src/__tests__/tracker-repository.test.ts (13 tests) 9386ms
   ✓ Tracker Repository > findOrCreateSession creates a new session for a new email
   ✓ Tracker Repository > findOrCreateSession returns the same session for the same email
   ✓ Tracker Repository > findOrCreateSession returns different sessions for different emails
   ✓ Tracker Repository > createTarget inserts a target and countActiveTargets counts it
   ✓ Tracker Repository > createTarget throws on duplicate (same session, keyword, domain, locale)
   ✓ Tracker Repository > listActiveTargets returns all active targets across sessions
   ✓ Tracker Repository > insertObservation and updateLastCheckedAt work together
   ✓ Tracker Repository > listTargetsByToken returns empty array for unknown token
   ✓ Tracker Repository > deactivateTarget sets active to false and returns true
   ✓ Tracker Repository > deactivateTarget returns false when token does not own the target
   ✓ Tracker Repository > listTargetsByToken includes up to 7 recent observations ordered by date desc
   ✓ Tracker Repository > findSessionByToken returns session for valid token
   ✓ Tracker Repository > findSessionByToken returns null for unknown token

 Test Files  1 passed (1)
      Tests  13 passed (13)
```

## Files Changed
- Created: `apps/worker/src/db/tracker-repository.ts` (172 lines)
- Modified: `apps/worker/src/db/index.ts` (added 6-line export block)
- Created: `apps/worker/src/__tests__/tracker-repository.test.ts` (143 lines)

## Commit
```
f690d45 feat(worker): tracker repository — session/target/observation CRUD
3 files changed, 322 insertions(+)
```

## Self-Review Findings
- The brief's prose says "all 12 tests pass" but the supplied test file contains 13 `it()` blocks; all 13 pass. The count discrepancy is in the brief, not the implementation.
- `listTargetsByToken` issues an N+1 query pattern (one observation query per target). Acceptable for the tracker use case (a single user's targets, bounded small N) and matches the brief's prescribed implementation. Flagged for future optimization if the per-token target count grows.
- `findOrCreateSession` swallows all INSERT errors and falls back to SELECT. Only the UNIQUE-violation race is expected in practice; a broader catch is intentional per the brief to keep the public API simple, but a genuine failure (e.g., connection loss) would mask as a "not found" retry. Low risk for the Sprint 0 mock environment.
- Node 25.8.0 engine warning is emitted by pnpm but tests run cleanly via vitest/tsx; no Node 24 path was needed.
- No process/container/listener started by this task; only the existing dev lifecycle stack (already running) was used.
