/**
 * Crew Agency service catalog — typed, Zod-validated loader.
 *
 * This module is the **single runtime entry point** for the Crew service
 * catalog. The catalog itself lives as a replaceable JSON fixture at
 * {@link DEFAULT_CATALOG_PATH} (`./crew-services.json` next to this module).
 * Real catalog contents "drop in" at that same path with the same schema — no
 * catalog entry is hardcoded anywhere else in the codebase (see
 * VAL-B-CATALOG-006).
 *
 * Design goals (see `architecture.md` §2.2 and validation-contract
 * VAL-B-CATALOG-004 / 005 / 006 / 014):
 *   - **Fail fast.** A malformed catalog (missing field, wrong type, empty
 *     `target_issue_tags`, out-of-vocabulary tag, invalid `tier`, or service
 *     count outside 5–8) causes {@link loadCrewCatalog} to throw at load —
 *     never returns a partial/coerced catalog or `undefined`.
 *   - **Single tag vocabulary.** `target_issue_tags` is validated against the
 *     canonical {@link IssueTag} union from `issue-tags.ts` (the same union
 *     used by `attachIssueTags` and the recommendation matcher).
 *   - **Closed tier enum.** `tier` must be `free | pro | agency` — the same
 *     enum threaded end-to-end through job data, cache TTL selection, and the
 *     Crew payload (architecture §4.5). Any other value is rejected at load.
 *   - **Replaceable.** The default source is read fresh from the fixture path
 *     on every call (so swapping the file and re-deploying picks up the new
 *     catalog with no code change). Tests may feed an explicit `source`
 *     argument to validate arbitrary fixture variants without touching disk.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { ISSUE_TAGS, type IssueTag } from '../issue-tags.js';

/**
 * The on-disk fixture path, resolved relative to this module so it works both
 * under Vitest (source tree) and when consumed from the compiled `dist/`
 * output (the build copies the JSON alongside the emitted JS).
 */
const DEFAULT_CATALOG_PATH: string = join(
  dirname(fileURLToPath(import.meta.url)),
  'crew-services.json',
);

/** Closed request-tier vocabulary shared with job data / cache TTL / Crew payload. */
export type CrewServiceTier = 'free' | 'pro' | 'agency';

/** Enumerable set of canonical {@link IssueTag} members for O(1) validation. */
const ISSUE_TAG_SET: ReadonlySet<string> = new Set(ISSUE_TAGS);

/**
 * Zod schema for a single canonical {@link IssueTag}. Rejects any string
 * outside the closed union with a clear `out-of-vocabulary` message (the Zod
 * error path points at the offending array element).
 */
const issueTagSchema = z.custom<IssueTag>(
  (val): val is IssueTag =>
    typeof val === 'string' && ISSUE_TAG_SET.has(val as string),
  (val) => ({
    message: `out-of-vocabulary IssueTag: ${JSON.stringify(val)} is not a member of the canonical IssueTag union`,
  }),
);

/** Zod schema for the closed {@link CrewServiceTier} enum. */
const tierSchema = z.enum(['free', 'pro', 'agency']);

/**
 * Zod schema for a single catalog service entry. Every field is required and
 * narrowly typed; `target_issue_tags` must be a non-empty array of canonical
 * {@link IssueTag} members, and `tier` must be a member of
 * {@link CrewServiceTier}.
 */
export const crewServiceSchema = z.object({
  service_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  target_issue_tags: z.array(issueTagSchema).min(1),
  tier: tierSchema,
  sla: z.string().min(1),
});

/**
 * Validated, fully-shaped catalog service entry — the typed view of one
 * element of `crew-services.json`. Exported so the recommendation matcher and
 * Crew payload builder can depend on a narrow, validated type instead of
 * `unknown` JSON.
 */
export type CrewService = z.infer<typeof crewServiceSchema>;

/**
 * Zod schema for the whole catalog: a non-empty array of 5–8 validated
 * services. The min/max bounds encode the catalog size invariant
 * (architecture §2.2: "5–8 services"); a fixture outside that range fails
 * fast at load.
 */
export const crewCatalogSchema = z.array(crewServiceSchema).min(5).max(8);

/**
 * Load and Zod-validate the Crew Agency service catalog.
 *
 * When `source` is omitted, the catalog is read fresh from the on-disk
 * fixture at {@link DEFAULT_CATALOG_PATH} (`packages/geo-engine/src/catalog/
 * crew-services.json`, or its compiled mirror in `dist/catalog/`). When
 * `source` is provided (any parsed JSON value), it is validated directly —
 * this is the seam tests use to feed malformed / swapped fixture variants
 * without touching disk (VAL-B-CATALOG-005 / VAL-B-CATALOG-006).
 *
 * Fails fast: any schema violation (missing required field, wrong type, empty
 * `target_issue_tags`, out-of-vocabulary tag, `tier` outside `free|pro|agency`,
 * or service count outside 5–8) causes a `ZodError` to throw at load — the
 * catalog is never returned partially valid, coerced, or `undefined`.
 *
 * @param source Optional parsed catalog JSON (defaults to the on-disk fixture).
 * @returns An array of 5–8 fully-shaped, Zod-validated {@link CrewService}
 *   entries (a fresh array on every call — callers may mutate freely).
 */
export function loadCrewCatalog(source?: unknown): CrewService[] {
  // Only an omitted argument (`undefined`) loads the on-disk fixture; an
  // explicit `null` (or any other non-array value) is validated and fails
  // fast — `??` would wrongly treat `null` as "use default".
  const raw: unknown = source === undefined ? readDefaultCatalog() : source;
  // `parse` (not `safeParse`) so any violation throws synchronously at load.
  return crewCatalogSchema.parse(raw);
}

/**
 * Read and JSON-parse the default on-disk fixture. Throws if the file is
 * missing or contains malformed JSON — consistent with the fail-fast contract.
 */
function readDefaultCatalog(): unknown {
  const text = readFileSync(DEFAULT_CATALOG_PATH, 'utf8');
  return JSON.parse(text);
}
