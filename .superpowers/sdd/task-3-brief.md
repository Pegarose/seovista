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
