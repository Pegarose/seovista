# Task 1: Migration 015 — Tracker Tables

**Files:**
- Create: `apps/worker/migrations/015_create_tracker_tables.sql`

**Interfaces:**
- Produces: three tables `tracker_sessions`, `keyword_targets`, `rank_observations` with columns matching the spec's data model. Later tasks rely on these exact column names.

## Steps

### Step 1: Create the migration SQL file

```sql
-- Migration 015: Tracker tables for Tier B B1 (recurring keyword rank tracking).
-- Three tables: tracker_sessions (email → token auth), keyword_targets
-- (tracking targets per session), rank_observations (time-series position
-- data per target). Reuses the existing gen_random_uuid() function from
-- pgcrypto (enabled in migration 003).

CREATE TABLE tracker_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  token      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE keyword_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES tracker_sessions(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  domain          TEXT NOT NULL,
  locale          TEXT NOT NULL DEFAULT 'tr-TR',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  UNIQUE(session_id, keyword, domain, locale)
);

CREATE TABLE rank_observations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id       UUID NOT NULL REFERENCES keyword_targets(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  top_competitors JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_keyword_targets_active ON keyword_targets(active) WHERE active = true;
CREATE INDEX idx_rank_obs_target_checked ON rank_observations(target_id, checked_at DESC);
```

### Step 2: Verify migration applies cleanly against the dev DB

Run:
```powershell
$env:DATABASE_URL = (Get-Content apps/worker/.env 2>$null | Select-String 'DATABASE_URL=' | Select-Object -First 1) -replace 'DATABASE_URL=',''
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgresql://seovista:seovista@127.0.0.1:8543/seovista_dev_1e623b62a87b' }
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH = 'C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker exec node -e "import('./dist/db/index.js').then(async m => { const c = m.createDbClient({ connectionString: process.env.DATABASE_URL, max: 1 }); const r = await m.createMigrationRunner(c, m.defaultMigrationsDir()).applyAll(); console.log('Applied', r.length, 'migrations'); await c.close(); })"
```
Expected: "Applied 1 migrations" (or 0 if already applied — the enhanced runner is idempotent).

### Step 3: Verify tables exist

Run:
```powershell
$env:DATABASE_URL = 'postgresql://seovista:seovista@127.0.0.1:8543/seovista_dev_1e623b62a87b'
pnpm --filter @seovista/worker exec node -e "import('./dist/db/client.js').then(async m => { const c = m.createDbClient({ connectionString: process.env.DATABASE_URL, max: 1 }); const r = await c.query(\"SELECT tablename FROM pg_tables WHERE tablename IN ('tracker_sessions','keyword_targets','rank_observations') ORDER BY tablename\"); console.log(r.rows.map(x => x.tablename)); await c.close(); })"
```
Expected: `[ 'keyword_targets', 'rank_observations', 'tracker_sessions' ]`

### Step 4: Commit

```bash
git add apps/worker/migrations/015_create_tracker_tables.sql
git commit -m "feat(db): migration 015 — tracker tables for Tier B B1

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```
