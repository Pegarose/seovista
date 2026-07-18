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
