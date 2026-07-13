import type { MapFailure } from "./types";

export function validateLocale(
  locale: string,
  supportedLocales: readonly string[],
): { success: true; value: string } | { success: false; value: MapFailure } {
  if (!supportedLocales.includes(locale)) {
    return {
      success: false,
      value: {
        success: false,
        field: "locale",
        reason: `Locale "${locale}" is not supported. Supported locales: ${supportedLocales.join(", ")}.`,
        redacted: true,
      },
    };
  }
  return { success: true, value: locale };
}

export function defaultLocale(supportedLocales: readonly string[]): string {
  return supportedLocales[0] ?? "en";
}

export function isEnglish(locale: string): boolean {
  return locale === "en";
}

export interface TranslationCandidate {
  readonly id: string;
  readonly locale: string;
  readonly translationKey?: string | undefined;
  readonly provenance: { readonly status: string };
  readonly indexation: { readonly indexable: boolean };
}

/**
 * Hreflang is safe only for distinct, reciprocal translated equivalents that
 * are both published and indexable. Locale equality alone is never evidence
 * that two records translate one another.
 */
export function isHreflangEligible(
  source: TranslationCandidate,
  counterpart: TranslationCandidate,
  supportedLocales: readonly string[],
): boolean {
  if (source.id === counterpart.id || source.locale === counterpart.locale) return false;
  if (!source.translationKey || source.translationKey !== counterpart.translationKey) return false;
  if (!supportedLocales.includes(source.locale) || !supportedLocales.includes(counterpart.locale)) return false;
  if (source.provenance.status !== "published" || counterpart.provenance.status !== "published") return false;
  return source.indexation.indexable && counterpart.indexation.indexable;
}
