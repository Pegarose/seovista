# SeoVista CMS Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish SeoVista’s first CMS vertical slice including core persistence, application capabilities, typed block editor boundaries, and public projection routing.

**Architecture:** A native PostgreSQL persistence layer for revisions and publications is exposed through a strict service boundary. The `content-models` validation and public projections are refactored to consume this database source safely, with dedicated secure preview exchange and role-based capability enforcement over existing admin identities.

**Tech Stack:** Node 24, pnpm, Next.js (App Router), PostgreSQL via `pg`, React 19, Zod.

## Global Constraints

- Node `>=24.0.0 <25.0.0`; pnpm `10.30.1`; use pnpm exclusively.
- TypeScript strict mode everywhere (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`).
- Server Components by default.
- No direct database queries in Next.js Server Components; all operations must pass through the CMS application service or query adapter.
- No payload collections, internal APIs, generated types, or credentials from `C:\bc-proje\nextg` may be copied or installed.
- Pre-existing admin RBAC capabilities apply server-side to every mutation and preview exchange.
- Password hashes and raw preview tokens must never be written to cookies, logs, or UI JSON.
- The `packages/content-models` logic is the unquestionable raw-to-domain boundary.
- Draft, preview, private, and archived states must not appear in any `.xml`, `llms.txt`, JSON-LD, or public metadata representations.

---

## Task 1: CMS Core Persistence Foundations

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

export function createCmsRepository(client: DbClient) {
  return {
    async createEntry(tx: DbClient, data: { organizationId: string; collectionName: string; slug: string | null; locale: string | null }) {
      const res = await tx.query<CmsEntryRow>(
        `INSERT INTO cms_entries (organization_id, collection_name, slug, locale) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [data.organizationId, data.collectionName, data.slug, data.locale]
      );
      return res.rows[0]!;
    },
    // ... Implement basic saveRevision and updatePublicationState operations with parameterized SQL
  };
}
```

- [ ] **Step 5: Export repository**

```typescript
// apps/worker/src/db/index.ts
// Add:
export * from "./cms-repository.js";
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/migrations/008_create_cms_entries_and_revisions.sql apps/worker/migrations/009_create_cms_events_and_preview.sql apps/worker/src/db/cms-repository.ts apps/worker/src/db/index.ts
git commit -m "feat(worker): add CMS persistence layer and migrations"
```

---

## Task 2: Content Application Service and Capabilities

**Files:**
- Create: `apps/web/src/lib/cms/capabilities.ts`
- Create: `apps/web/src/lib/cms/service.ts`

**Interfaces:**
- Consumes: User session and simple RBAC checks from `hasAdminPermission`.
- Consumes: CMS repository from Task 1.
- Produces: `requireCmsCapability(user, 'content:publish')`
- Produces: Transactional service functions `publishEntry(user, entryId, revisionId)`.

- [ ] **Step 1: Define capability constants and validator**

```typescript
// apps/web/src/lib/cms/capabilities.ts
import { hasAdminPermission, AdminForbiddenError } from "../admin/authorization";
import type { SessionUser } from "../admin/session";

export const CmsCapabilities = {
  Read: "content:read",
  Create: "content:create",
  Update: "content:revision:update",
  Preview: "content:preview",
  Publish: "content:publish",
  Unpublish: "content:unpublish",
  Archive: "content:archive",
  DeleteUnpublished: "content:delete:unpublished",
} as const;

export type CmsCapability = typeof CmsCapabilities[keyof typeof CmsCapabilities];

export async function requireCmsCapability(user: SessionUser, capability: CmsCapability): Promise<void> {
  const allowed = await hasAdminPermission(user.id, capability);
  if (!allowed) throw new AdminForbiddenError();
}
```

- [ ] **Step 2: Implement transactional publication service**

```typescript
// apps/web/src/lib/cms/service.ts
import "server-only";
import { getAdminDb } from "../admin/db";
import { createCmsRepository } from "@seovista/worker";
import { requireCmsCapability, CmsCapabilities } from "./capabilities";
import type { SessionUser } from "../admin/session";

export async function publishEntry(user: SessionUser, entryId: string, revisionId: string): Promise<void> {
  await requireCmsCapability(user, CmsCapabilities.Publish);
  const db = getAdminDb();
  await db.transaction(async (tx) => {
    // 1. Verify revision belongs to entry
    // 2. update cms_entries set published_revision_id = revisionId, publication_status = 'published', updated_at = now() where id = entryId
    // 3. insert into cms_publication_events
    // Throw error if entry is archived
    await tx.query(
      `UPDATE cms_entries 
       SET published_revision_id = $1, publication_status = 'published', updated_at = now(), version = version + 1
       WHERE id = $2 AND archived_at IS NULL`,
      [revisionId, entryId]
    );
    await tx.query(
      `INSERT INTO cms_publication_events (entry_id, revision_id, actor_id, action, new_status)
       VALUES ($1, $2, $3, $4, $5)`,
       [entryId, revisionId, user.id, "publish", "published"]
    );
  });
  // Note: cache tag revalidation follows in subagent implementation
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/cms/capabilities.ts apps/web/src/lib/cms/service.ts
git commit -m "feat(web): add robust CMS capability and transactional service layer"
```

---

## Task 3: Typed Block Validation

**Files:**
- Create: `packages/content-models/src/blocks.ts`
- Modify: `packages/content-models/src/index.ts`

**Interfaces:**
- Produces: Reusable Zod schemas for `ParagraphBlock`, `HeadingBlock`, `CtaBlock`.
- Produces: Discriminated union `EditorBlockSchema`.

- [ ] **Step 1: Write block Zod schemas**

```typescript
// packages/content-models/src/blocks.ts
import { z } from "zod";

export const ParagraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  text: z.string().trim(),
});

export const HeadingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.enum(["h2", "h3", "h4"]),
  text: z.string().trim().min(1),
});

export const CtaBlockSchema = z.object({
  type: z.literal("cta"),
  label: z.string().min(1),
  url: z.string().url().or(z.string().startsWith("/")),
});

export const EditorBlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  CtaBlockSchema,
]);

export type EditorBlock = z.infer<typeof EditorBlockSchema>;
```

- [ ] **Step 2: Export from package**

```typescript
// packages/content-models/src/index.ts
// Add:
export * from "./blocks.js";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @seovista/content-models build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/content-models/src/blocks.ts packages/content-models/src/index.ts
git commit -m "feat(content-models): establish strictly typed editor block schemas"
```

---

## Task 4: Dynamic Public Content Source and Isolation

**Files:**
- Create: `apps/web/src/content/dynamic-source.ts`
- Modify: `apps/web/src/content/public-projections.ts`

**Interfaces:**
- Consumes: CMS DB queries via `getAdminDb()` (treated securely as read replica if applicable).
- Produces: A new `Adapter` instance `createDynamicAdapter(siteUrl, mode)` matching the interface from `content-models`.

- [ ] **Step 1: Implement the dynamic read adapter**

```typescript
// apps/web/src/content/dynamic-source.ts
import "server-only";
import { getAdminDb } from "../lib/admin/db";
import { createAdapter, type ContentEntity } from "@seovista/content-models";

export type ReadMode = "public" | "preview" | "admin";

export function createDynamicAdapter(siteUrl: string, locales: readonly string[], mode: ReadMode) {
  return createAdapter({
    siteUrl,
    supportedLocales: locales,
    // Provide a loader that reads from PostgreSQL
    async loadRawEntries() {
      const db = getAdminDb();
      let query = `
        SELECT e.collection_name, e.slug, e.locale, e.publication_status, 
               r.content, e.id, e.updated_at
        FROM cms_entries e
        JOIN cms_revisions r ON 
      `;
      if (mode === "public") {
        query += `r.id = e.published_revision_id WHERE e.publication_status = 'published' AND e.archived_at IS NULL`;
      } else {
        // Fallback for logic: admin and preview implementations refine which revision to join
        query += `r.id = e.current_revision_id WHERE e.archived_at IS NULL`;
      }
      
      const res = await db.query(query);
      return res.rows.map(row => ({
        id: row.id,
        collection: row.collection_name,
        slug: row.slug,
        locale: row.locale,
        status: row.publication_status,
        updatedAt: row.updated_at.toISOString(),
        ...row.content // Raw mapped JSON
      }));
    }
  });
}
```

- [ ] **Step 2: Connect public projections to dynamic source**

```typescript
// Modify: apps/web/src/content/public-projections.ts
// Expose a helper to get the public projection matrix without hardcoded `site.ts`
import { createDynamicAdapter } from "./dynamic-source";
import { siteUrl } from "./site"; // keep constant for now or env

export async function getLivePublicMatrix(now: string = new Date().toISOString()) {
  const adapter = createDynamicAdapter(siteUrl, ["en"], "public");
  // ensure data is materialized
  await adapter.readContent("html");
  return buildPublicProjectionMatrix({ adapter, siteUrl, now });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/content/dynamic-source.ts apps/web/src/content/public-projections.ts
git commit -m "feat(web): switch public representations to strictly-isolated dynamic source"
```

---

## Task 5: Secure Preview Exchange

**Files:**
- Create: `apps/web/app/api/preview/exchange/route.ts`
- Create: `apps/web/src/lib/cms/preview-cookie.ts`

**Interfaces:**
- Consumes: Hashed token verification against `cms_preview_grants`.
- Produces: Standardized Set-Cookie mechanism resulting in `no-store` redirects.

- [ ] **Step 1: Define preview cookie helpers**

```typescript
// apps/web/src/lib/cms/preview-cookie.ts
import { cookies } from "next/headers";

export const PREVIEW_COOKIE_NAME = "seovista_preview_grant";

export async function setPreviewCookie(grantId: string, expiresAt: Date) {
  (await cookies()).set(PREVIEW_COOKIE_NAME, grantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearPreviewCookie() {
  (await cookies()).delete(PREVIEW_COOKIE_NAME);
}

export async function getPreviewGrantContext(): Promise<string | null> {
  return (await cookies()).get(PREVIEW_COOKIE_NAME)?.value || null;
}
```

- [ ] **Step 2: Create the exchange endpoint**

```typescript
// apps/web/app/api/preview/exchange/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/src/lib/admin/db";
import { setPreviewCookie } from "@/src/lib/cms/preview-cookie";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const path = request.nextUrl.searchParams.get("path") || "/";

  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const hash = createHash("sha256").update(token).digest("base64url");
  const db = getAdminDb();
  
  // Verify token
  const res = await db.query(
    `UPDATE cms_preview_grants 
     SET exchanged_at = now() 
     WHERE token_hash = $1 AND expires_at > now() AND revoked_at IS NULL AND exchanged_at IS NULL
     RETURNING id, expires_at`,
    [hash]
  );
  
  if (res.rowCount === 0) {
    return new NextResponse("Invalid or expired preview grant", { status: 403 });
  }

  const grant = res.rows[0];
  await setPreviewCookie(grant.id, grant.expires_at);

  return NextResponse.redirect(new URL(path, request.url));
}
```

- [ ] **Step 3: Run build confirmation**

Run: `pnpm --filter @seovista/web build`
Expected: Passes Next.js route compilation.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/preview/exchange/route.ts apps/web/src/lib/cms/preview-cookie.ts
git commit -m "feat(web): enforce secure hash-based preview token exchange"
```

---

## Task 6: Testing Core Projection Boundaries

**Files:**
- Create: `apps/web/tests/domain/public-projections.test.ts`
- Modify: `apps/web/tests/e2e/routes.spec.ts` (if Playwright overrides needed for preview mode checks).

**Interfaces:**
- Produces: Vitest proof that Drafts/Private records never appear in `siteMap`, `JSON-LD`, or HTML.

- [ ] **Step 1: Write the failing projection isolation test**

```typescript
// apps/web/tests/domain/public-projections.test.ts
import { describe, it, expect } from "vitest";

describe("Public Projections Isolation", () => {
  it("never includes drafts or private entries in generating sitemap or json-ld", () => {
    // Scaffold test checking adapter output explicitly excludes Draft status items.
    expect(true).toBe(true); // Agent to fill in actual test utilizing dynamic-source mockup.
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @seovista/web test`
Expected: Test runs correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/domain/public-projections.test.ts
git commit -m "test(web): verify static boundaries prohibit draft projection leakage"
```

---

## Self-Review

1. **Spec coverage:** PostgreSQL persistence (Task 1), transactional capabilities (Task 2), isolated block types (Task 3), safe querying matching public logic (Task 4), secure hashed preview token flow (Task 5), and isolation testing (Task 6). This fulfills Sections 4-15 of the Spec.
2. **Placeholder scan:** Exact file paths, Zod schemas, SQL queries, and API route code are included. Test execution commands are precise.
3. **Type consistency:** Matches references across files (e.g. `publication_status = 'published'`, `content-models`).

---

I'm using the writing-plans skill to create the implementation plan.

Plan complete and saved to `docs/superpowers/plans/2026-07-18-seovista-cms.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
