export type AlertKind =
  | "dropped_out_of_top10"
  | "entered_top10"
  | "significant_drop"
  | "significant_rise";

/**
 * Decide whether a position transition (previous observation -> new
 * observation) fires an alert. `0` means the domain was not found in the
 * top 10 results. Categories are mutually exclusive: a single transition
 * yields at most one alert, so the return type is `AlertKind | null`.
 *
 * - First observation (prev === null): no alert — establishes the baseline.
 * - 1..10 -> 0: dropped out of the top 10.
 * - 0 -> 1..10: entered the top 10.
 * - in-band movement of >= minDelta: significant_drop / significant_rise.
 */
export function evaluateTransition(
  prev: number | null,
  next: number,
  minDelta: number,
): AlertKind | null {
  if (prev === null || prev === next) return null;
  if (prev === 0) {
    return next >= 1 && next <= 10 ? "entered_top10" : null;
  }
  if (next === 0) return "dropped_out_of_top10";
  if (next - prev >= minDelta) return "significant_drop";
  if (prev - next >= minDelta) return "significant_rise";
  return null;
}
