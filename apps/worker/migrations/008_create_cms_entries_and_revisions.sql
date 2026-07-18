-- apps/worker/migrations/008_create_cms_entries_and_revisions.sql
CREATE TABLE IF NOT EXISTS cms_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES admin_organizations(id),
  collection_name TEXT NOT NULL,
  slug TEXT,
  locale TEXT,
  current_revision_id UUID,  -- Set via trigger or deferred FK
  published_revision_id UUID,
  publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'preview', 'published', 'private')),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_cms_entries_active_slug ON cms_entries (collection_name, locale, slug) WHERE archived_at IS NULL AND slug IS NOT NULL AND locale IS NOT NULL;

CREATE TABLE IF NOT EXISTS cms_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES cms_entries(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  content JSONB NOT NULL,
  content_checksum TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, revision_number)
);

-- Note: In production we would add FK constraints for current_revision_id and published_revision_id
