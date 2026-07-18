import type { DbClient } from "./client.js";

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

export function createCmsRepository(db: DbClient) {
  return {
    async createEntry(entry: Omit<CmsEntryRow, 'id' | 'publication_status' | 'archived_at' | 'version'>): Promise<CmsEntryRow> {
      const result = await db.query(
        `INSERT INTO cms_entries (
          organization_id,
          collection_name,
          slug,
          locale,
          current_revision_id,
          published_revision_id
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          entry.organization_id,
          entry.collection_name,
          entry.slug,
          entry.locale,
          entry.current_revision_id,
          entry.published_revision_id
        ]
      );
      if (!result.rows[0]) throw new Error("Failed to create entry");
      return result.rows[0] as CmsEntryRow;
    },

    async saveRevision(revision: {
      entry_id: string;
      revision_number: number;
      schema_version: string;
      content: unknown;
      content_checksum: string;
      created_by: string;
    }): Promise<{ id: string }> {
      const result = await db.query(
        `INSERT INTO cms_revisions (
          entry_id,
          revision_number,
          schema_version,
          content,
          content_checksum,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          revision.entry_id,
          revision.revision_number,
          revision.schema_version,
          JSON.stringify(revision.content),
          revision.content_checksum,
          revision.created_by
        ]
      );
      if (!result.rows[0]) throw new Error("Failed to save revision");
      return { id: result.rows[0].id as string };
    },

    async updatePublicationState(
      entryId: string,
      status: 'draft' | 'preview' | 'published' | 'private',
      publishedRevisionId: string | null
    ): Promise<void> {
      await db.query(
        `UPDATE cms_entries
         SET publication_status = $1, published_revision_id = $2
         WHERE id = $3`,
        [status, publishedRevisionId, entryId]
      );
    },

    async createPreviewGrant(grant: {
      token_hash: string;
      entry_id: string;
      revision_id: string;
      issued_by: string;
      expires_at: Date;
    }): Promise<{ id: string }> {
      const result = await db.query(
        `INSERT INTO cms_preview_grants (
          token_hash,
          entry_id,
          revision_id,
          issued_by,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          grant.token_hash,
          grant.entry_id,
          grant.revision_id,
          grant.issued_by,
          grant.expires_at
        ]
      );
      if (!result.rows[0]) throw new Error("Failed to create preview grant");
      return { id: result.rows[0].id as string };
    },

    async verifyPreviewGrant(tokenHash: string): Promise<{ entry_id: string; revision_id: string } | null> {
      const result = await db.query(
        `SELECT entry_id, revision_id
         FROM cms_preview_grants
         WHERE token_hash = $1
           AND revoked_at IS NULL
           AND expires_at > now()`,
        [tokenHash]
      );
      if (!result.rows[0]) return null;
      return {
        entry_id: result.rows[0].entry_id as string,
        revision_id: result.rows[0].revision_id as string
      };
    }
  };
}
