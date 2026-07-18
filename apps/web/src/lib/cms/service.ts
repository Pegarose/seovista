import "server-only";
import { getAdminDb } from "../admin/db";
import { requireCmsCapability, CmsCapabilities } from "./capabilities";
import type { SessionUser } from "../admin/session";

export async function publishEntry(user: SessionUser, entryId: string, revisionId: string): Promise<void> {
  await requireCmsCapability(user, CmsCapabilities.Publish);
  const db = getAdminDb();
  await db.transaction(async (tx) => {
    // 1. Verify revision belongs to entry
    const revisionResult = await tx.query(
      `SELECT entry_id FROM cms_revisions WHERE id = $1`,
      [revisionId]
    );
    if (revisionResult.rowCount === 0) {
      throw new Error("Revision not found");
    }
    if (revisionResult.rows[0].entry_id !== entryId) {
      throw new Error("Revision does not belong to the specified entry");
    }

    // 2. update cms_entries set published_revision_id = revisionId, publication_status = 'published', updated_at = now() where id = entryId
    // 3. insert into cms_publication_events
    // Throw error if entry is archived
    const updateResult = await tx.query(
      `UPDATE cms_entries 
       SET published_revision_id = $1, publication_status = 'published', updated_at = now(), version = version + 1
       WHERE id = $2 AND archived_at IS NULL`,
      [revisionId, entryId]
    );

    if (updateResult.rowCount === 0) {
      const entryResult = await tx.query(`SELECT archived_at FROM cms_entries WHERE id = $1`, [entryId]);
      if (entryResult.rowCount === 0) {
        throw new Error("Entry not found");
      }
      if (entryResult.rows[0].archived_at !== null) {
        throw new Error("Cannot publish an archived entry");
      }
      throw new Error("Failed to update entry");
    }

    await tx.query(
      `INSERT INTO cms_publication_events (entry_id, revision_id, actor_id, action, new_status)
       VALUES ($1, $2, $3, $4, $5)`,
       [entryId, revisionId, user.id, "publish", "published"]
    );
  });
  // Note: cache tag revalidation follows in subagent implementation
}
