# Task 1 Report: Migration 015 — Tracker Tables

## What I Implemented

Created `apps/worker/migrations/015_create_tracker_tables.sql` with three tables and two indexes, exactly as specified in the task brief:

- **`tracker_sessions`** — email/token auth table with `id` (UUID PK, `gen_random_uuid()`), unique `email`, unique `token`, `created_at`.
- **`keyword_targets`** — tracking targets per session; FK to `tracker_sessions(id)` with `ON DELETE CASCADE`; `keyword`, `domain`, `locale` (default `'tr-TR'`), `active` (default `true`), `created_at`, nullable `last_checked_at`; composite `UNIQUE(session_id, keyword, domain, locale)`.
- **`rank_observations`** — time-series positions; FK to `keyword_targets(id)` with `ON DELETE CASCADE`; `position` (INTEGER), `checked_at` (default `now()`), `top_competitors` (JSONB default `'[]'`).
- **Indexes:** `idx_keyword_targets_active` (partial, `WHERE active = true`), `idx_rank_obs_target_checked` (`target_id, checked_at DESC`).

The migration reuses `gen_random_uuid()` from pgcrypto (enabled in migration 003). No `IF NOT EXISTS` guards were added, matching the brief's SQL verbatim and the style of earlier migrations (e.g. 003 uses bare `CREATE TABLE`).

## What I Tested and Results

1. **Worker build:** `pnpm --filter @seovista/worker run build` — exit 0, TypeScript compiled cleanly.

2. **Migration apply:** Ran the migration runner against the dev DB (`postgresql://seovista:seovista@127.0.0.1:8543/seovista_dev_1e623b62a87b`). Output: `Applied 1 migrations`. The runner is idempotent (re-running returns 0).

3. **Table verification:** Queried `pg_tables` — result: `[ 'keyword_targets', 'rank_observations', 'tracker_sessions' ]` (matches expected).

4. **Index verification:** Queried `pg_indexes` — confirmed `idx_keyword_targets_active`, `idx_rank_obs_target_checked`, plus PK indexes and the `keyword_targets_session_id_keyword_domain_locale_key` unique constraint index.

5. **Ledger verification:** `seovista_migrations` row for `id=15`, `name='create_tracker_tables'`, with a SHA-256 checksum — confirms the hardened migration runner recorded it.

### Environment note

The environment runs Node v25.8.0 while the project pins Node 24.12.0 (`.nvmrc`). Under Node 25, `import('./dist/db/index.js')` fails because the barrel re-exports `audit.ts`, which imports `@seovista/audit-core` → `ipaddr.js`, and `ipaddr.js` does not provide named ESM exports `IPv4`/`IPv6` under Node 25. This is a pre-existing environment/Node-version mismatch, not a defect in this migration. To verify, I imported directly from `dist/db/migrations.js` and `dist/db/client.js` (which do not pull in audit-core), bypassing the barrel. The migration itself is unaffected.

## Files Changed

- **Created:** `apps/worker/migrations/015_create_tracker_tables.sql` (35 lines)

No other files were modified by this task. An unrelated `apps/web/tsconfig.json` modification was present in the working tree (concurrent agent) and was left unstaged.

## Commits

- `ffedb92` — `feat(db): migration 015 — tracker tables for Tier B B1`

## Self-Review Findings

- The SQL matches the brief byte-for-byte (verified by re-reading the committed file).
- Column names, types, defaults, constraints, and index definitions all align with the spec's data model that later tasks depend on.
- FK cascade deletes are in place: deleting a session cascades to its targets, which cascade to their observations.
- The partial index on `active = true` optimizes the recurring-scan query path.
- The `checked_at DESC` index on observations supports the "latest position per target" lookup pattern.
- No concerns with the migration itself. The only concern is environmental (Node 25 vs pinned 24), which is outside this task's scope but worth flagging for the parent: any verification step that imports the full `db/index.js` barrel will fail under Node 25 until the environment is switched to Node 24 or `ipaddr.js`/`@seovista/audit-core` is updated.
