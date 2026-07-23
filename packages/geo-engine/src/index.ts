export type {
  GeoReadinessMethodologyVersion,
  GeoReadinessScores,
  GeoReadinessCheck,
  GeoReadinessPriority,
  GeoReadinessLimitation,
  GeoReadinessResult,
  PassFailRule,
  ScoringConfiguration,
} from "./types.js";

export type { ScoreContext, ParsedPage } from "./types.js";
export type { ScoreOutput } from "./engine.js";
export { ScoringEngine, SCORE_VERSION } from "./engine.js";

export { defaultScoringConfiguration, defaultLimitations, getScoringConfiguration } from "./scoring.js";

export { parseGeoReadinessResult, GeoReadinessValidationError } from "./result.js";

export const name: string = "@seovista/geo-engine";
