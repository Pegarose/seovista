import "server-only";
import { getAdminDb } from "../lib/admin/db";
import { createAdapter, type DomainEntity, type ReadMode } from "@seovista/content-models";

export type { ReadMode } from "@seovista/content-models";

export async function createDynamicAdapter(siteUrl: string, locales: readonly string[], mode: ReadMode) {
  const db = getAdminDb();
  let query = `
    SELECT e.collection_name, e.slug, e.locale, e.publication_status, 
           r.content, e.id, e.updated_at
    FROM cms_entries e
    JOIN cms_revisions r ON 
  `;
  if (mode.kind === "public") {
    query += `r.id = e.published_revision_id WHERE e.publication_status = 'published' AND e.archived_at IS NULL`;
  } else {
    // Fallback for logic: admin and preview implementations refine which revision to join
    query += `r.id = e.current_revision_id WHERE e.archived_at IS NULL`;
  }
  
  const res = await db.query(query);
  const entities = res.rows.map(row => ({
    id: row.id,
    collection: row.collection_name,
    slug: row.slug,
    locale: row.locale,
    status: row.publication_status,
    updatedAt: row.updated_at.toISOString(),
    ...row.content // Raw mapped JSON
  })) as DomainEntity[];

  return createAdapter(entities, {
    trustedSiteUrl: siteUrl,
    supportedLocales: locales,
    defaultLocale: locales[0] ?? "en",
    mode
  });
}
