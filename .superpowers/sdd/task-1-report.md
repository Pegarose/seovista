# Task 1 Report — Migration 016: `tracker_alerts` table + session consent columns

## What I implemented

Created the Tier B B3 tracker alerts schema migration and its invariant test:

- **Migration `016_create_tracker_alerts.sql`** —
  - `ALTER TABLE tracker_sessions` adds `alert_consent BOOLEAN NOT NULL DEFAULT false` and `alert_consent_updated_at TIMESTAMPTZ`.
  - `CREATE TABLE tracker_alerts` with `id` (UUID PK, `gen_random_uuid()`), `target_id`/`session_id` FKs (`ON DELETE CASCADE`), `kind` TEXT with a CHECK constraint over the four allowed kinds (`dropped_out_of_top10`, `entered_top10`, `significant_drop`, `significant_rise`), `from_position`/`to_position` INTEGER, `observed_at`/`created_at`/`emailed_at` TIMESTAMPTZ, and `UNIQUE(target_id, kind, observed_at)` idempotency key.
  - Two indexes: `idx_tracker_alerts_session (session_id, created_at DESC)` and partial `idx_tracker_alerts_unsent (session_id) WHERE emailed_at IS NULL`.
- **Test `tracker-alerts-migration.test.ts`** — 3 tests covering required columns, session consent columns, and the kind CHECK constraint. Matches the brief verbatim.

## TDD evidence

### RED — verify failure (migration not yet applied)

Command:
```
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-alerts-migration
```

Result: `Tests  2 failed | 1 passed (3)` before the migration file existed.
- `creates tracker_alerts with the required columns` → FAIL (cols `[]`, expected array containing the 9 columns).
- `adds alert_consent and alert_consent_updated_at to tracker_sessions` → FAIL (`expected [] to deeply equal [ 'alert_consent', ... ]`).
- `enforces the kind check constraint` → passed trivially because inserting into the non-existent `tracker_alerts` table throws, satisfying `rejects.toThrow()`.
This is the expected RED state: the `tracker_alerts` table and the consent columns do not exist yet.

### GREEN — verify pass (migration applied)

Same command after creating `016_create_tracker_alerts.sql`.

Result:
```
✓ src/__tests__/tracker-alerts-migration.test.ts (3 tests) 2583ms
  ✓ Migration 016 — Tracker Alerts > creates tracker_alerts with the required columns and check constraint  934ms
  ✓ Migration 016 — Tracker Alerts > adds alert_consent and alert_consent_updated_at to tracker_sessions  802ms
  ✓ Migration 016 — Tracker Alerts > enforces the kind check constraint  846ms
Test Files  1 passed (1)
Tests  3 passed (3)
```

## Files changed

- `apps/worker/migrations/016_create_tracker_alerts.sql` (new)
- `apps/worker/src/__tests__/tracker-alerts-migration.test.ts` (new)

Commit: `147562c feat(worker): add tracker alerts migration 016` on `bugfix/foundation-geo-recovery-real` (2 files changed, 79 insertions).

## Self-review findings

- Migration test passes (3 tests): confirmed.
- SQL matches the brief verbatim — column names, CHECK constraint kinds (4), both indexes (`idx_tracker_alerts_session`, partial `idx_tracker_alerts_unsent`), and `UNIQUE(target_id, kind, observed_at)` idempotency key: confirmed.
- Commit is on the branch (`147562c`): confirmed.
- No scratch/tsconfig files staged — only the two named files in the commit; working tree still shows unstaged `.superpowers/sdd/` and `apps/web/tsconfig.json` modifications, none staged: confirmed.
- Migration 016 header comment and `gen_random_uuid()` usage match the style of migration 015.

## Concerns

- The lifecycle Postgres+Redis stack was not running when I started; I started it via the sanctioned `node scripts/infrastructure-lifecycle.js start seovista-dev-665e4ef3e642` command (docker cannot be invoked directly due to the session's blocked-command policy). The brief's `SEOVISTA_LIFECYCLE_CONTEXT_PATH` (`.../seovista-dev-665e4ef3e642-context.json`) still resolves to ports 8543/8637, which the started stack serves, so tests pass. The started stack is still running; the brief's Step 5 commit step does not require teardown, but a follow-up owner may want to retire it.
