export type {
  DataForSeoCapability,
  DataForSeoScenario,
  DataForSeoRequest,
  DataForSeoOutcome,
  NormalizedResult,
  NormalizedCheck,
  CostRecord,
  BudgetState,
  DataForSeoSideEffectCounts,
  DataForSeoProvider,
} from "./types.js";

export { createMockDataForSeo, createUnconfiguredDataForSeo, type MockDataForSeoOptions } from "./mock.js";
export { SPRINT_ZERO_PROVIDER_MATRIX, type ProviderMatrixRow, type ProviderMatrixStatus } from "./provider-matrix.js";

export const name: string = "@seovista/dataforseo";
