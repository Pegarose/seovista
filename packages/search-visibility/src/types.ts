/**
 * Core domain types for the search-visibility package.
 */

export type KeywordLifecycleStatus =
  | "idle"
  | "validating"
  | "saving"
  | "queued"
  | "running"
  | "retrying"
  | "succeeded"
  | "partially_failed"
  | "failed"
  | "cancelled"
  | "ownership_invalid"
  | "conflict"
  | "rejected"
  | "degraded";

export type VolumeStatus = "available" | "unknown";
export type SerpFeature = "featured_snippet" | "knowledge_panel" | "people_also_ask" | "video_carousel" | "image_pack" | "local_pack" | string;

/** A tracked keyword entity scoped to a workspace and project. */
export interface TrackedKeyword {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  /** The canonical display form as entered by the user. */
  readonly displayKeyword: string;
  /** The normalized comparison form (Unicode NFC, case-folded, whitespace-collapsed). */
  readonly normalizedKeyword: string;
  readonly status: KeywordLifecycleStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A snapshot of a SERP result for a tracked keyword at a point in time. */
export interface SerpSnapshot {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly trackedKeywordId: string;
  readonly capturedAt: string;
  readonly position: number | null;
  readonly volume: number | null;
  readonly volumeStatus: VolumeStatus;
  readonly features: SerpFeature[];
  readonly hasResults: boolean;
  readonly provider: string;
  readonly fixtureId?: string;
  readonly operationKey: string;
  readonly runId: string;
}

/** A historical record of a keyword's rank position. */
export interface RankSnapshot {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly trackedKeywordId: string;
  readonly serpSnapshotId: string;
  readonly capturedAt: string;
  readonly position: number | null;
  readonly hasRank: boolean;
}

/** A metric value (volume, difficulty, etc.) for a tracked keyword. */
export interface SearchVisibilityMetric {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly trackedKeywordId: string;
  readonly capturedAt: string;
  readonly volume: number | null;
  readonly volumeStatus: VolumeStatus;
  readonly position: number | null;
  readonly features: SerpFeature[];
  readonly hasResults: boolean;
  readonly provider: string;
  readonly fixtureId?: string;
  readonly operationKey: string;
  readonly runId: string;
}
