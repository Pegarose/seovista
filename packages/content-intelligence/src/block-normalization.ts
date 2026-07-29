/**
 * Block normalization for CMS content.
 *
 * Accepts supported paragraph, heading, list, and link blocks and
 * normalizes them into a canonical typed representation. Malformed,
 * unknown, or unsafe blocks return typed validation errors.
 */

import { createTypedError, typedErrorCodes } from "./typed-errors.js";
import type { TypedError } from "./typed-errors.js";

// ── Public types ───────────────────────────────────────────────────────────

/** Supported editor block input types. */
export type EditorBlockInput =
  | { type: "paragraph"; text: string; [key: string]: unknown }
  | { type: "heading"; level: string; text: string; [key: string]: unknown }
  | { type: "list"; ordered?: boolean; items: string[]; [key: string]: unknown }
  | { type: "link"; text: string; url: string; [key: string]: unknown }
  | Record<string, unknown>;

export interface NormalizedParagraphBlock {
  readonly type: "paragraph";
  readonly text: string;
}

export interface NormalizedHeadingBlock {
  readonly type: "heading";
  readonly level: "h2" | "h3" | "h4";
  readonly text: string;
}

export interface NormalizedListBlock {
  readonly type: "list";
  readonly ordered: boolean;
  readonly items: readonly string[];
}

export interface NormalizedLinkBlock {
  readonly type: "link";
  readonly text: string;
  readonly url: string;
}

export type NormalizedBlock =
  | NormalizedParagraphBlock
  | NormalizedHeadingBlock
  | NormalizedListBlock
  | NormalizedLinkBlock;

/** Type guard: true when the value is a block normalization error. */
export function isBlockError(value: unknown): value is TypedError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "retryable" in value &&
    "message" in value &&
    typeof (value as TypedError).code === "string" &&
    typeof (value as TypedError).retryable === "boolean" &&
    typeof (value as TypedError).message === "string"
  );
}

// ── Implementation ─────────────────────────────────────────────────────────

const VALID_HEADING_LEVELS = new Set(["h2", "h3", "h4"]);

const UNSAFE_URL_SCHEMES = ["javascript:", "data:", "file:", "vbscript:"];

/** Check if a URL uses an unsafe scheme. */
function isUnsafeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return UNSAFE_URL_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

/**
 * Normalize a single editor block into its canonical typed representation.
 *
 * Returns a `TypedError` for unknown types, malformed blocks, or unsafe content.
 */
export function normalizeBlock(input: EditorBlockInput): NormalizedBlock | TypedError {
  if (!input || typeof input !== "object") {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "Block must be a valid object",
    });
  }

  const type = input.type;

  switch (type) {
    case "paragraph": {
      if (typeof input.text !== "string") {
        return createTypedError({
          code: typedErrorCodes.validation.malformed,
          retryable: false,
          message: "Paragraph block must have a 'text' field of type string",
        });
      }
      const text = input.text.trim();
      return {
        type: "paragraph",
        text,
      } satisfies NormalizedParagraphBlock;
    }

    case "heading": {
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (text.length === 0) {
        return createTypedError({
          code: typedErrorCodes.validation.blank,
          retryable: false,
          message: "Heading text must not be blank",
        });
      }
      const level = typeof input.level === "string" ? input.level.toLowerCase() : "";
      if (!VALID_HEADING_LEVELS.has(level)) {
        return createTypedError({
          code: typedErrorCodes.validation.malformed,
          retryable: false,
          message: `Invalid heading level '${input.level}'. Use h2, h3, or h4.`,
        });
      }
      return {
        type: "heading",
        level: level as "h2" | "h3" | "h4",
        text,
      } satisfies NormalizedHeadingBlock;
    }

    case "list": {
      const items = Array.isArray(input.items)
        ? input.items.filter((i): i is string => typeof i === "string").map((i) => i.trim())
        : [];
      return {
        type: "list",
        ordered: input.ordered === true,
        items,
      } satisfies NormalizedListBlock;
    }

    case "link": {
      const text = typeof input.text === "string" ? input.text.trim() : "";
      const url = typeof input.url === "string" ? input.url.trim() : "";

      if (url.length === 0) {
        return createTypedError({
          code: typedErrorCodes.validation.malformed,
          retryable: false,
          message: "Link URL must not be empty",
        });
      }

      // Check for unsafe URL schemes
      if (isUnsafeUrl(url)) {
        return createTypedError({
          code: typedErrorCodes.validation.malformed,
          retryable: false,
          message: `URL scheme is not allowed: ${url.split(":")[0]}`,
        });
      }

      // Basic URL validation
      try {
        new URL(url);
      } catch {
        // Allow relative URLs starting with /
        if (!url.startsWith("/")) {
          return createTypedError({
            code: typedErrorCodes.validation.malformed,
            retryable: false,
            message: "Link URL is malformed",
          });
        }
      }

      return {
        type: "link",
        text,
        url,
      } satisfies NormalizedLinkBlock;
    }

    default: {
      return createTypedError({
        code: typedErrorCodes.validation.malformed,
        retryable: false,
        message: `Unknown block type '${String(type)}'`,
      });
    }
  }
}

/**
 * Normalize an array of editor blocks into an ordered array of canonical blocks.
 *
 * Returns a `TypedError` if any individual block fails normalization.
 */
export function normalizeDocument(
  blocks: readonly EditorBlockInput[],
): readonly NormalizedBlock[] | TypedError {
  if (!Array.isArray(blocks)) {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "Document must be an array of blocks",
    });
  }

  const normalized: NormalizedBlock[] = [];
  for (const block of blocks) {
    const result = normalizeBlock(block);
    if (isBlockError(result)) {
      return result;
    }
    normalized.push(result);
  }
  return normalized;
}
