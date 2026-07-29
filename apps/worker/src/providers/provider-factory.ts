/**
 * Server-side provider factory — the sole selector for search visibility
 * providers. Client code must never import this module or read credentials.
 *
 * The canonical selector is SEOVISTA_SEARCH_PROVIDER_MODE:
 *   - missing/empty → deterministic mock (default, never contacts DataForSEO)
 *   - "mock"       → deterministic mock
 *   - "live"       → fixture-backed adapter (when opt-in + credentials present)
 *   - any other    → ProviderSelectionInvalid (fail-closed)
 *
 * Explicit live mode requires ALL of:
 *   1. SEOVISTA_SEARCH_PROVIDER_MODE="live"
 *   2. SEOVISTA_SEARCH_PROVIDER_LIVE_OPT_IN="1"
 *   3. Valid credentials
 *   4. Injected fixture transport (in mission validation, real transport is
 *      rejected so no real egress occurs)
 *
 * Missing any requirement fails closed with a typed error.
 */

import "server-only";

import {
  createMockSearchVisibilityProvider,
  createTypedError,
  typedErrorCodes,
} from "@seovista/search-visibility";
import type {
  SearchVisibilityProvider,
  TypedError,
} from "@seovista/search-visibility";

// ── Accepted provider modes ──────────────────────────────────────────────

/** Union of accepted semantic provider mode strings. */
export type ProviderMode = "mock" | "live";

/** Normalize and validate the raw mode string. */
function parseProviderMode(raw: string | undefined): ProviderMode | TypedError {
  // Missing or empty → default to mock
  if (raw === undefined || raw === "" || raw === "mock") {
    return "mock";
  }

  // Explicit live
  if (raw === "live") {
    return "live";
  }

  // Case-variant, unknown, or invalid → fail closed
  return createTypedError({
    code: typedErrorCodes.provider.selection_invalid,
    retryable: false,
    message: `Invalid provider mode: "${raw}". Accepted values are "mock" (default) and "live" (requires opt-in).`,
  });
}

// ── Provider selection context ───────────────────────────────────────────

/**
 * Typed context passed to the provider factory. In tests, fixtureTransport
 * is injected so that live selections never make real external requests.
 */
export interface ProviderSelectionContext {
  /** Raw SEOVISTA_SEARCH_PROVIDER_MODE value. */
  readonly mode?: string;

  /** Explicit live-provider opt-in flag. */
  readonly liveOptIn?: boolean;

  /** Credential object (never logged or serialized). */
  readonly credentials?: {
    readonly apiKey?: string;
  };

  /**
   * Injected fixture transport for mission validation.
   * Real transport is never created; mission validation rejects
   * live selections that lack an injected fixture transport.
   */
  readonly fixtureTransport?: unknown;
}

// ── Public factory ───────────────────────────────────────────────────────

/**
 * Create the search visibility provider for the given selection context.
 *
 * This is the single, documented, server-side entrypoint for provider
 * selection. Every server application service, route handler, and worker
 * processor that needs search visibility uses this factory. Client code
 * must never call it.
 *
 * @returns A SearchVisibilityProvider on success, or a typed error on
 *          invalid/insufficient selection.
 */
export function createSearchVisibilityProvider(
  ctx: ProviderSelectionContext,
): SearchVisibilityProvider | TypedError {
  const mode = parseProviderMode(ctx.mode);

  // Invalid/case-variant → fail closed
  if (typeof mode !== "string") {
    return mode;
  }

  // Mock path (default) — never needs credentials or opt-in
  if (mode === "mock") {
    return createMockSearchVisibilityProvider();
  }

  // Live path — validate every requirement before allowing selection
  if (mode === "live") {
    // 1. Explicit opt-in required
    if (ctx.liveOptIn !== true) {
      return createTypedError({
        code: typedErrorCodes.provider.not_opted_in,
        retryable: false,
        message:
          "Live search visibility provider requires explicit opt-in (SEOVISTA_SEARCH_PROVIDER_LIVE_OPT_IN=1).",
      });
    }

    // 2. Credentials required
    if (!ctx.credentials?.apiKey) {
      return createTypedError({
        code: typedErrorCodes.provider.credentials_missing,
        retryable: false,
        message:
          "Live search visibility provider credentials are missing or invalid.",
      });
    }

    // 3. Fixture transport required in mission validation
    if (!ctx.fixtureTransport) {
      return createTypedError({
        code: typedErrorCodes.provider.selection_invalid,
        retryable: false,
        message:
          "Live provider requires an injected fixture transport in mission validation.",
      });
    }

    // 4. Fixture-backed live adapter — not yet implemented in Sprint 0.
    //    The adapter will be built in Milestone 5 (live-advanced-worker).
    return createTypedError({
      code: typedErrorCodes.provider.selection_invalid,
      retryable: false,
      message:
        "Live DataForSEO adapter is not yet implemented (scheduled for Milestone 5). Use the mock provider for now.",
    });
  }

  // Exhaustive — should be unreachable after parseProviderMode
  return createTypedError({
    code: typedErrorCodes.provider.selection_invalid,
    retryable: false,
    message: `Unknown provider mode: "${String(mode)}".`,
  });
}
