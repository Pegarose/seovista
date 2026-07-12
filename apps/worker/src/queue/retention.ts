import type { KeepJobs } from "bullmq";

export interface RetentionPolicy {
  maxCompletedCount: number;
  maxFailedCount: number;
  maxCompletedAgeSeconds: number;
  maxFailedAgeSeconds: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  maxCompletedCount: 100,
  maxFailedCount: 100,
  maxCompletedAgeSeconds: 86400,
  maxFailedAgeSeconds: 86400,
};

export interface RetentionJobOptions {
  removeOnComplete: KeepJobs;
  removeOnFail: KeepJobs;
}

export function applyRetentionPolicy(
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY
): RetentionJobOptions {
  return {
    removeOnComplete: {
      count: policy.maxCompletedCount,
      age: policy.maxCompletedAgeSeconds,
    },
    removeOnFail: {
      count: policy.maxFailedCount,
      age: policy.maxFailedAgeSeconds,
    },
  };
}
