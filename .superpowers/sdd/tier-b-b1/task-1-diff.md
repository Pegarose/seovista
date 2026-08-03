## Commits
ffedb92 feat(db): migration 015 — tracker tables for Tier B B1

## Stat
 .../migrations/015_create_tracker_tables.sql       | 35 ++++++++++++++++++++++
 1 file changed, 35 insertions(+)

## Full Diff
diff --git a/apps/worker/migrations/015_create_tracker_tables.sql b/apps/worker/migrations/015_create_tracker_tables.sql
new file mode 100644
index 0000000..1839ca9
--- /dev/null
+++ b/apps/worker/migrations/015_create_tracker_tables.sql
@@ -0,0 +1,35 @@
+-- Migration 015: Tracker tables for Tier B B1 (recurring keyword rank tracking).
+-- Three tables: tracker_sessions (email → token auth), keyword_targets
+-- (tracking targets per session), rank_observations (time-series position
+-- data per target). Reuses the existing gen_random_uuid() function from
+-- pgcrypto (enabled in migration 003).
+
+CREATE TABLE tracker_sessions (
+  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
+  email      TEXT UNIQUE NOT NULL,
+  token      TEXT UNIQUE NOT NULL,
+  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
+);
+
+CREATE TABLE keyword_targets (
+  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
+  session_id      UUID NOT NULL REFERENCES tracker_sessions(id) ON DELETE CASCADE,
+  keyword         TEXT NOT NULL,
+  domain          TEXT NOT NULL,
+  locale          TEXT NOT NULL DEFAULT 'tr-TR',
+  active          BOOLEAN NOT NULL DEFAULT true,
+  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
+  last_checked_at TIMESTAMPTZ,
+  UNIQUE(session_id, keyword, domain, locale)
+);
+
+CREATE TABLE rank_observations (
+  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
+  target_id       UUID NOT NULL REFERENCES keyword_targets(id) ON DELETE CASCADE,
+  position        INTEGER NOT NULL,
+  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
+  top_competitors JSONB NOT NULL DEFAULT '[]'::jsonb
+);
+
+CREATE INDEX idx_keyword_targets_active ON keyword_targets(active) WHERE active = true;
+CREATE INDEX idx_rank_obs_target_checked ON rank_observations(target_id, checked_at DESC);
