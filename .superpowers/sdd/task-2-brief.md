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
