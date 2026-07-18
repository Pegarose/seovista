import "server-only";
import { getAdminDb } from "../lib/admin/db";
import { createAdapter, mapEntity, type DomainEntity } from "@seovista/content-models";

export type ReadMode = "public" | "preview" | "admin";

export async function createDynamicAdapter(siteUrl: string, locales: readonly string[], mode: ReadMode) {
  const contentMode = mode === "public" ? { kind: "public" as const, now: new Date() } : { kind: "preview" as const, now: new Date(), authorization: { scope: "preview" as const, issuedAt: new Date(), expiresAt: new Date(), tokenHash: "" } };
  
  const db = getAdminDb();
  let query = `
    SELECT e.collection_name, e.slug, e.locale, e.publication_status, 
           r.content, e.id, e.created_at, e.updated_at
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
  const entities: DomainEntity[] = [];

  const mapOptions = {
    trustedSiteUrl: siteUrl,
    supportedLocales: locales,
    defaultLocale: locales[0] ?? "en",
    mode: contentMode
  };

  for (const row of res.rows) {
    const rawEnvelope = {
      id: row.id,
      collection: row.collection_name,
      slug: row.slug,
      locale: row.locale,
      provenance: {
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        status: row.publication_status,
        locale: row.locale,
        version: 1
      },
      ...row.content
    };

    const outcome = mapEntity(rawEnvelope, mapOptions);
    if (outcome.success) {
      entities.push(outcome.value);
    }
  }

  return createAdapter(entities, mapOptions);
}
