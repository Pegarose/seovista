import type { RawCollectionResponse, RawEntity, RawErrorResponse } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isRawEntity(value: unknown): value is RawEntity {
  if (!isObject(value)) return false;
  if (typeof value.id !== "string" || typeof value.collection !== "string") return false;
  const p = value.provenance;
  if (!isObject(p)) return false;
  return (
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string" &&
    typeof p.locale === "string" &&
    typeof p.version === "number" &&
    (p.status === "published" ||
      p.status === "draft" ||
      p.status === "preview" ||
      p.status === "private")
  );
}

export function isRawCollectionResponse(value: unknown): value is RawCollectionResponse {
  if (!isObject(value)) return false;
  if (typeof value.collection !== "string") return false;
  if (value.mode !== "public" && value.mode !== "preview") return false;
  if (typeof value.locale !== "string") return false;
  if (!Array.isArray(value.items)) return false;
  if (typeof value.generatedAt !== "string") return false;
  if (typeof value.total !== "number") return false;
  return value.items.every(isRawEntity);
}

export function isRawErrorResponse(value: unknown): value is RawErrorResponse {
  return (
    isObject(value) &&
    typeof value.error === "string" &&
    typeof value.code === "string"
  );
}
