import type { DbClient } from "./client.js";
import { type Article, mapEntity, type MapOptions } from "@seovista/content-models";

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

export interface PublishedInsightListRow {
  slug: string;
  title: string;
  status: string;
  published_at: Date;
}

export interface PublishedInsightDetail {
  slug: string;
  title: string;
  status: string;
  published_at: Date;
  blocks: unknown[];
  article: Article;
}

export interface AdminInsightListRow {
  id: string;
  slug: string | null;
  title: string | null;
  status: string;
  author_identity: string | null;
  created_at: Date;
}

export interface AdminInsightDetail {
  title: string;
  slug: string;
  status: string;
  blocks: any[];
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
    },

    async getAllInsightsForAdmin(): Promise<AdminInsightListRow[]> {
      const result = await db.query(
        `SELECT 
           e.id,
           e.slug,
           (r.content->>'title') as title,
           e.publication_status as status,
           r.created_by as author_identity,
           r.created_at
         FROM cms_entries e
         LEFT JOIN cms_revisions r ON e.current_revision_id = r.id
         WHERE e.collection_name = 'articles'
           AND e.archived_at IS NULL
         ORDER BY r.created_at DESC`
      );
      return result.rows.map(row => ({
        id: row.id as string,
        slug: row.slug as string | null,
        title: row.title as string | null,
        status: row.status as string,
        author_identity: row.author_identity as string | null,
        created_at: row.created_at as Date,
      }));
    },

    async getPublishedInsights(): Promise<PublishedInsightListRow[]> {
      const result = await db.query(
        `SELECT 
           e.slug,
           (r.content->>'title') as title,
           e.publication_status as status,
           r.created_at as published_at
         FROM cms_entries e
         JOIN cms_revisions r ON e.published_revision_id = r.id
         WHERE e.collection_name = 'articles'
           AND e.publication_status = 'published'
           AND e.archived_at IS NULL
         ORDER BY r.created_at DESC`
      );
      return result.rows.map(row => ({
        slug: row.slug as string,
        title: row.title as string,
        status: row.status as string,
        published_at: row.published_at as Date,
      }));
    },

    async getPublishedInsightBySlug(slug: string, mapOptions: MapOptions): Promise<PublishedInsightDetail | null> {
      const result = await db.query(
        `SELECT 
           e.slug,
           e.publication_status as status,
           r.created_at as published_at,
           r.content
         FROM cms_entries e
         JOIN cms_revisions r ON e.published_revision_id = r.id
         WHERE e.collection_name = 'articles'
           AND e.slug = $1
           AND e.publication_status = 'published'
           AND e.archived_at IS NULL`,
        [slug]
      );
      
      const row = result.rows[0];
      if (!row) return null;

      const rawContent = row.content as any;
      const parsedBlocks = Array.isArray(rawContent.body) ? rawContent.body : [];

      const mappedEntity = mapEntity(rawContent, mapOptions);
      if (!mappedEntity.success || mappedEntity.value.kind !== 'article') {
         throw new Error("Failed to map article entity");
      }

      return {
        slug: row.slug as string,
        title: rawContent.title as string || mappedEntity.value.title || "",
        status: row.status as string,
        published_at: row.published_at as Date,
        blocks: parsedBlocks,
        article: mappedEntity.value,
      };
    },

    async getInsightEntryById(id: string): Promise<AdminInsightDetail | null> {
      const result = await db.query(
        `SELECT 
           e.slug,
           e.publication_status as status,
           r.content
         FROM cms_entries e
         LEFT JOIN cms_revisions r ON e.current_revision_id = r.id
         WHERE e.id = $1
           AND e.collection_name = 'articles'
           AND e.archived_at IS NULL`,
        [id]
      );
      
      const row = result.rows[0];
      if (!row) return null;

      const rawContent = (row.content as any) || {};
      const parsedBlocks = Array.isArray(rawContent.body) ? rawContent.body : [];

      return {
        slug: row.slug as string || "",
        title: rawContent.title as string || "",
        status: row.status as string || "draft",
        blocks: parsedBlocks,
      };
    },

    async updateInsightEntryById(
      id: string,
      payload: { title: string; slug: string; status: string; blocks: any[] },
      authorIdentity: string
    ): Promise<void> {
      // Create new content string including title and body (blocks)
      const content = {
        title: payload.title,
        body: payload.blocks,
      };

      // 1. Insert new revision
      const revisionResult = await db.query(
        `INSERT INTO cms_revisions (
          entry_id,
          revision_number,
          schema_version,
          content,
          content_checksum,
          created_by
        ) VALUES (
          $1,
          COALESCE((SELECT MAX(revision_number) FROM cms_revisions WHERE entry_id = $1), 0) + 1,
          '1.0.0',
          $2,
          'temp-checksum', -- Note: in real implementation, you'd calculate a real checksum
          $3
        ) RETURNING id`,
        [id, JSON.stringify(content), authorIdentity]
      );

      const revisionId = revisionResult.rows[0]?.id;
      if (!revisionId) {
        throw new Error("Failed to create new revision for update");
      }

      // 2. Update entry with new slug, status, and point current (and published if published) revision to this new revision
      
      // We will only overwrite published_revision_id if status=published, OR if we need to clear it ?
      // If we go from published to draft, published_revision_id stays or is cleared?
      // Since 'published_revision_id' tracks what's live, we'll follow standard logic:
      // In this simple function we just update both if 'published'. If not published, we don't clear it unless instructed. For now just set current_revision_id.
      await db.query(
        `UPDATE cms_entries
         SET 
           slug = $2, 
           publication_status = $3, 
           current_revision_id = $4,
           published_revision_id = CASE WHEN $3 = 'published' THEN $4 ELSE published_revision_id END,
           version = version + 1
         WHERE id = $1`,
        [id, payload.slug, payload.status, revisionId]
      );
    }
  };
}
