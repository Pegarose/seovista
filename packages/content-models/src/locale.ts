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

export function isHreflangEligible(
  locale: string,
  entityLocale: string,
  supportedLocales: readonly string[],
): boolean {
  if (locale === entityLocale) return false;
  if (!supportedLocales.includes(entityLocale)) return false;
  return true;
}
