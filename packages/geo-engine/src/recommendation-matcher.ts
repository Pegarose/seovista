import type { AuditIssue, Severity } from './types.js';
import type { CrewService } from './catalog/index.js';
import type { IssueTag } from './issue-tags.js';

/**
 * Output shape for a service matched against an audit's issues.
 */
export interface MatchedService {
  service_id: string;
  name: string;
  description: string;
  matchedTags: IssueTag[];
  relevanceScore: number;
  addressedIssueCodes: string[];
}

/**
 * Deterministic fallback weights for issue severities when `pointLoss` is absent or zero.
 * Strictly positive and strictly ordered: critical > high > medium > low > info.
 */
const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = Object.freeze({
  critical: 10,
  high: 7,
  medium: 4,
  low: 2,
  info: 1,
  experimental: 1,
});

/**
 * Calculate the deterministic relevance score contribution of a single issue.
 */
function getIssueContribution(issue: AuditIssue): number {
  if (typeof issue.pointLoss === 'number') {
    return Math.abs(issue.pointLoss);
  }
  const weight = SEVERITY_WEIGHTS[issue.severity];
  return typeof weight === 'number' ? weight : 1;
}

/**
 * Pure, deterministic tag->service matcher for recommendation engine.
 *
 * `matchServices(issues: AuditIssue[], catalog: CrewService[]): MatchedService[]`
 *
 * For each catalog service:
 * - Aggregates `relevanceScore` over issues whose `issueTags` intersect `service.target_issue_tags`.
 * - Each matching issue contributes once per service.
 * - `pointLoss` absolute value is used if present and non-zero; falls back to severity weight otherwise.
 * - `matchedTags` populated with distinct intersecting target tags (preserving target_issue_tags order).
 * - `addressedIssueCodes` populated with contributing issue codes (deduped, input-order stable).
 * - Returns only services with `relevanceScore > 0`.
 * - Sorted by `relevanceScore` descending, tie-broken by `service_id` ascending (stable).
 * - Pure: no I/O, no network, no env reads, no console, no input mutation; returns a new reference.
 */
export function matchServices(
  issues: AuditIssue[],
  catalog: CrewService[],
): MatchedService[] {
  if (!issues || issues.length === 0 || !catalog || catalog.length === 0) {
    return [];
  }

  const matchedServices: MatchedService[] = [];

  for (const service of catalog) {
    if (!service.target_issue_tags || service.target_issue_tags.length === 0) {
      continue;
    }

    const targetTagSet = new Set<IssueTag>(service.target_issue_tags);
    const intersectingTagsInServiceOrder = new Set<IssueTag>();
    const addressedIssueCodes: string[] = [];
    const seenIssueCodes = new Set<string>();
    let relevanceScore = 0;

    for (const issue of issues) {
      if (!issue.issueTags || issue.issueTags.length === 0) {
        continue;
      }

      // Check for intersection with service target tags
      let hasIntersection = false;
      for (const tag of issue.issueTags) {
        if (targetTagSet.has(tag)) {
          hasIntersection = true;
          intersectingTagsInServiceOrder.add(tag);
        }
      }

      if (hasIntersection) {
        relevanceScore += getIssueContribution(issue);
        if (!seenIssueCodes.has(issue.code)) {
          seenIssueCodes.add(issue.code);
          addressedIssueCodes.push(issue.code);
        }
      }
    }

    if (relevanceScore > 0) {
      // Preserve service.target_issue_tags order for matchedTags
      const matchedTags: IssueTag[] = [];
      const seenMatchedTags = new Set<IssueTag>();
      
      for (const tag of service.target_issue_tags) {
        if (intersectingTagsInServiceOrder.has(tag) && !seenMatchedTags.has(tag)) {
          seenMatchedTags.add(tag);
          matchedTags.push(tag);
        }
      }

      matchedServices.push({
        service_id: service.service_id,
        name: service.name,
        description: service.description,
        matchedTags,
        relevanceScore,
        addressedIssueCodes,
      });
    }
  }

  // Sort relevanceScore desc, service_id asc tie-break
  matchedServices.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return a.service_id.localeCompare(b.service_id);
  });

  return matchedServices;
}
