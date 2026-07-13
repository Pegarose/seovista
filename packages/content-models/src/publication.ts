import type {
  PublicationStatus,
  ReadMode,
  ContentProjection,
  ContentEntity,
  MapFailure,
} from "./types";

export interface IndexationFlags {
  readonly indexable: boolean;
  readonly followLinks: boolean;
  readonly includeInSitemap: boolean;
  readonly includeInFeed: boolean;
  readonly includeInJsonLd: boolean;
}

export function normalizeIndexation(flags?: Partial<IndexationFlags>): IndexationFlags {
  const indexable = flags?.indexable ?? true;
  return {
    indexable,
    followLinks: flags?.followLinks ?? true,
    includeInSitemap: indexable && (flags?.includeInSitemap ?? true),
    includeInFeed: indexable && (flags?.includeInFeed ?? false),
    includeInJsonLd: indexable && (flags?.includeInJsonLd ?? true),
  };
}

export function validateIndexationCombination(
  status: PublicationStatus,
  indexable: boolean,
): { success: true } | { success: false; value: MapFailure } {
  if (status === "private" && indexable) {
    return {
      success: false,
      value: {
        success: false,
        field: "indexation.indexable",
        reason: "Private content cannot be indexable.",
        redacted: true,
      },
    };
  }
  if (status === "draft" && indexable) {
    return {
      success: false,
      value: {
        success: false,
        field: "indexation.indexable",
        reason: "Draft content cannot be indexable.",
        redacted: true,
      },
    };
  }
  if (status === "preview" && indexable) {
    return {
      success: false,
      value: {
        success: false,
        field: "indexation.indexable",
        reason: "Preview content cannot be indexable.",
        redacted: true,
      },
    };
  }
  return { success: true };
}

export function isPubliclyEligible(
  status: PublicationStatus,
  indexable: boolean,
  mode: ReadMode,
  projection: ContentProjection,
): boolean {
  if (status === "private") return false;
  if (status === "draft") return false;
  if (status === "preview") {
    return mode.kind === "preview" && isPreviewAuthorized(mode) && projection === "html";
  }
  if (status !== "published") return false;
  if (!indexable) {
    return projection === "html" || projection === "metadata" || projection === "jsonLd";
  }
  return true;
}

export function isPreviewAuthorized(mode: ReadMode): boolean {
  if (mode.kind !== "preview") return false;
  const now = mode.now.getTime();
  const auth = mode.authorization;
  return auth.scope === "preview" && now >= auth.issuedAt.getTime() && now < auth.expiresAt.getTime();
}

export function isContentEntityPubliclyEligible(
  entity: ContentEntity,
  mode: ReadMode,
  projection: ContentProjection,
): boolean {
  if (entity.provenance.status === "private") return false;
  if (entity.provenance.status === "draft") return false;
  if (entity.provenance.status === "preview") {
    return mode.kind === "preview" && isPreviewAuthorized(mode) && projection === "html";
  }
  if (entity.provenance.status !== "published") return false;
  if (!entity.indexation.indexable) {
    return projection === "html" || projection === "metadata" || projection === "jsonLd";
  }
  return true;
}

export function isSitemapEligible(entity: ContentEntity, mode: ReadMode): boolean {
  if (!isContentEntityPubliclyEligible(entity, mode, "sitemap")) return false;
  if (entity.provenance.status !== "published") return false;
  return entity.indexation.includeInSitemap;
}

export function isFeedEligible(entity: ContentEntity, mode: ReadMode): boolean {
  if (!isContentEntityPubliclyEligible(entity, mode, "feed")) return false;
  if (entity.provenance.status !== "published") return false;
  return entity.indexation.includeInFeed;
}

export function isJsonLdEligible(entity: ContentEntity, mode: ReadMode): boolean {
  if (!isContentEntityPubliclyEligible(entity, mode, "jsonLd")) return false;
  return entity.indexation.includeInJsonLd;
}

export function isLocalePubliclyEligible(locale: { kind: "locale"; isSupported: boolean }): boolean {
  return locale.isSupported;
}

export function isRedirectPubliclyEligible(redirect: { kind: "redirect"; permanent: boolean }): boolean {
  return redirect.permanent;
}

export function isAuditLeadPrivate(): boolean {
  return true;
}
