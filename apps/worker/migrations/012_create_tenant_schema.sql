-- Multi-tenant workspace and project schema. Every workspace belongs to
-- exactly one organization. Every workspace-scoped child carries composite
-- ownership through (workspace_id) or (workspace_id, id) foreign keys so
-- mismatched, orphaned, or cross-tenant rows fail atomically.
-- Migration 012 is transactional; failure rolls back all DDL below.

-- ---------------------------------------------------------------------------
-- Extend migration ledger with checksum column for drift detection.
-- The column defaults to 'legacy' for previously-applied migrations so the
-- new runner can distinguish pre-checksum from checksummed records.
-- ---------------------------------------------------------------------------
ALTER TABLE seovista_migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT 'legacy';

-- ---------------------------------------------------------------------------
-- Workspaces — the tenant boundary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES admin_organizations(id),
  name TEXT NOT NULL CHECK (length(name) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- Every workspace(id, organization_id) is naturally unique because id is the
-- primary key; this explicit unique constraint enables composite foreign keys
-- from child tables that must prove organization-level ownership alignment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_id_org
  ON workspaces (id, organization_id);

-- ---------------------------------------------------------------------------
-- Workspace memberships — user-to-workspace with capability role
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_memberships (
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES admin_organizations(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite FK proves the workspace and org are aligned
  FOREIGN KEY (workspace_id, organization_id)
    REFERENCES workspaces(id, organization_id),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace
  ON workspace_memberships (workspace_id);

-- ---------------------------------------------------------------------------
-- Projects — belong to exactly one workspace and organization
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(name) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite FK ensures the project's workspace belongs to the same
  -- organization; passing a project ID from workspace A to workspace B is
  -- rejected at the database level.
  FOREIGN KEY (workspace_id, organization_id)
    REFERENCES workspaces(id, organization_id),
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace
  ON projects (workspace_id);

-- ---------------------------------------------------------------------------
-- Extend cms_entries with workspace ownership.
-- The column is added as nullable during migration so existing rows are not
-- rejected; application code must populate it before the next tenant-aware
-- release and a later migration will make it NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE cms_entries
  ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- Add a composite foreign key that will be enforced once the column is
-- populated. For now the FK is NOT VALID so existing rows are untouched;
-- new rows validated by application code will satisfy the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cms_entries_workspace_org'
  ) THEN
    ALTER TABLE cms_entries
      ADD CONSTRAINT fk_cms_entries_workspace_org
      FOREIGN KEY (workspace_id, organization_id)
      REFERENCES workspaces(id, organization_id)
      NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Extend job_records with workspace and project ownership. Nullable for now.
-- ---------------------------------------------------------------------------
ALTER TABLE job_records
  ADD COLUMN IF NOT EXISTS workspace_id UUID,
  ADD COLUMN IF NOT EXISTS project_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_records_workspace'
  ) THEN
    ALTER TABLE job_records
      ADD CONSTRAINT fk_job_records_workspace
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_records_project'
  ) THEN
    ALTER TABLE job_records
      ADD CONSTRAINT fk_job_records_project
      FOREIGN KEY (project_id) REFERENCES projects(id)
      NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Authority column on job_records to carry principal/actor identity
-- ---------------------------------------------------------------------------
ALTER TABLE job_records
  ADD COLUMN IF NOT EXISTS actor_id UUID;

-- ---------------------------------------------------------------------------
-- Indexes for tenant-scoped lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_job_records_workspace
  ON job_records (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_records_project
  ON job_records (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cms_entries_workspace
  ON cms_entries (workspace_id)
  WHERE workspace_id IS NOT NULL;
