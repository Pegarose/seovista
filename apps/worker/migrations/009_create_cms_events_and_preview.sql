-- apps/worker/migrations/009_create_cms_events_and_preview.sql
CREATE TABLE IF NOT EXISTS cms_publication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES cms_entries(id),
  revision_id UUID NOT NULL REFERENCES cms_revisions(id),
  actor_id UUID NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_preview_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  entry_id UUID NOT NULL REFERENCES cms_entries(id),
  revision_id UUID NOT NULL REFERENCES cms_revisions(id),
  issued_by UUID NOT NULL REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  exchanged_at TIMESTAMPTZ
);
