/**
 * Deterministic keyword normalization.
 *
 * Trims Unicode whitespace, applies Unicode NFC normalization,
 * collapses internal whitespace to a single space, and case-folds
 * for comparison while preserving the canonical display form.
 */

import { createTypedError, typedErrorCodes } from "./typed-errors.js";
import type { TypedError } from "./typed-errors.js";

/** The documented maximum keyword length. */
export const MAX_KEYWORD_LENGTH = 255;

/** A successfully normalized keyword. */
export interface NormalizedKeyword {
  /** The canonical display form. */
  readonly display: string;
  /** The normalized comparison key (NFC + case-folded + whitespace-collapsed). */
  readonly normalized: string;
}

/**
 * Normalize a raw keyword string into its canonical display and comparison forms.
 *
 * Returns a `TypedError` for blank or over-limit inputs.
 */
export function normalizeKeyword(raw: string): NormalizedKeyword | TypedError {
  // 1. Trim Unicode whitespace (covers \p{Zs} and ASCII space/tab/newline)
  const trimmed = raw.replace(/^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/u, "")
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+$/u, "");

  // 2. Blank check
  if (trimmed.length === 0) {
    return createTypedError({
      code: typedErrorCodes.validation.blank,
      retryable: false,
      message: "Keyword must not be blank",
    });
  }

  // 3. Apply Unicode NFC normalization
  const nfc = trimmed.normalize("NFC");

  // 4. Case-fold for comparison (toLowerCase is sufficient for Turkish-free SEO context;
  //    the locale-insensitive .toLowerCase() is the documented choice)
  const caseFolded = nfc.toLowerCase();

  // 5. Collapse internal whitespace to a single space
  const collapsed = caseFolded.replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/gu, " ");

  // 6. Length check — use the NFC display form for length measurement
  if (nfc.length > MAX_KEYWORD_LENGTH) {
    return createTypedError({
      code: typedErrorCodes.validation.too_long,
      retryable: false,
      message: `Keyword exceeds maximum length of ${MAX_KEYWORD_LENGTH} characters`,
    });
  }

  // Also collapse internal whitespace in the display form
  const display = nfc.replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/gu, " ");

  return {
    display,
    normalized: collapsed,
  };
}
