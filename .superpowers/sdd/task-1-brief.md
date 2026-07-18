## Task 1: CMS Core Persistence

**Files:**
- Create: `apps/worker/migrations/008_create_cms_entries_and_revisions.sql`
- Create: `apps/worker/migrations/009_create_cms_events_and_preview.sql`
- Create: `apps/worker/src/db/cms-repository.ts`
- Modify: `apps/worker/src/db/index.ts` to export repository functions.

**Interfaces:**
- Produces: `cms_entries` and `cms_revisions` tables with `publication_status` and `archived_at`.
- Produces: `publication_events` and `preview_grants` security tables.
- Produces: `createCmsRepository(db)` providing `createEntry`, `saveRevision`, `updatePublicationState`, `createPreviewGrant`, `verifyPreviewGrant`.

- [ ] **Step 1: Write the entries and revisions migration**

```sql
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
```

- [ ] **Step 2: Write the events and preview migration**

```sql
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
```

- [ ] **Step 3: Run the migrations locally to test validity**

Run: `node --run db:migrate --filter @seovista/worker` (or equivalent migration script).
Expected: PASS. The tables `cms_entries`, `cms_revisions`, `cms_publication_events`, and `cms_preview_grants` are created.

- [ ] **Step 4: Create the CMS repository layer**

```typescript
// apps/worker/src/db/cms-repository.ts
import type { DbClient } from "./client";

export interface CmsEntryRow {
  id: string;
  organization_id: string;
  collection_name: string;
  slug: string | null;
  locale: string | null;
  current_revision_id: string | null;
  published_revision_id: string | null;
  publication_status: 'draft' | 'preview' | 'published' | 'private';
  archived_at: Date | null;
  version: number;
}
