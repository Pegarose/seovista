export type {
  DataForSeoCapability,
  DataForSeoScenario,
  DataForSeoRequest,
  DataForSeoOutcome,
  NormalizedResult,
  NormalizedCheck,
  CostRecord,
  BudgetState,
  DataForSeoProvider,
} from "./types.js";

export { createMockDataForSeo, createUnconfiguredDataForSeo, type MockDataForSeoOptions } from "./mock.js";

export const name: string = "@seovista/dataforseo";
