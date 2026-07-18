import type { RawEntity } from "./types";

export interface ArticleVM {
  id: string;
  title: string;
  slug: string;
  summary: string;
  publishedAt: string;
}

function str(entity: RawEntity, key: string): string | null {
  const v = entity[key];
  return typeof v === "string" && v.trim() ? v : null;
}

export function toArticleVM(entity: RawEntity): ArticleVM | null {
  const title = str(entity, "title");
  const slug = str(entity, "slug");
  if (!title || !slug) return null;
  return {
    id: entity.id,
    title,
    slug,
    summary: str(entity, "summary") ?? str(entity, "description") ?? "",
    publishedAt: entity.provenance.createdAt,
  };
}
