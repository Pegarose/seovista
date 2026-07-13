import type {
  DataForSeoCapability,
  DataForSeoRequest,
  DataForSeoOutcome,
  NormalizedResult,
  CostRecord,
  BudgetState,
  DataForSeoProvider,
} from "./types.js";

export interface MockDataForSeoOptions {
  readonly capability?: DataForSeoCapability;
  readonly dailyLimit?: number;
  readonly currency?: string;
  readonly now?: () => Date;
}

export function createMockDataForSeo(options: MockDataForSeoOptions = {}): DataForSeoProvider {
  const capability: DataForSeoCapability = options.capability === undefined || options.capability === "mock" ? "mock" : "unconfigured";
  const dailyLimit = options.dailyLimit ?? 100;
  const currency = options.currency ?? "USD";
  const now = options.now ?? (() => new Date("2026-07-01T00:00:00.000Z"));
  let spentToday = 0;
  let attempted = 0;
  let successful = 0;
  let costRecords = 0;

  function getBudget(): BudgetState {
    return {
      dailyLimit,
      spentToday,
      currency,
      remaining: Math.max(0, dailyLimit - spentToday),
    };
  }

  function buildSuccessResult(request: DataForSeoRequest): NormalizedResult {
    return {
      taskId: request.taskId,
      target: request.target,
      completedAt: now().toISOString(),
      checks: [
        { name: "crawlable", category: "accessibility", passed: true, value: true, severity: "info", evidence: [] },
        { name: "canonical_present", category: "seo", passed: true, value: true, severity: "info", evidence: [] },
      ],
      limitations: ["Sprint 0 mock result; no live crawl performed."],
    };
  }

  function buildCost(request: DataForSeoRequest): CostRecord {
    const amount = 0.05;
    spentToday += amount;
    return {
      requestId: request.taskId,
      provider: "dataforseo",
      operation: request.operation,
      amount,
      currency,
      recordedAt: now().toISOString(),
    };
  }

  async function execute(request: DataForSeoRequest): Promise<DataForSeoOutcome> {
    attempted += 1;
    if (capability === "unconfigured") {
      return {
        capability,
        scenario: request.scenario,
        success: false,
        error: { code: "UNCONFIGURED", message: "DataForSEO provider is not configured.", retryable: false },
      };
    }

    if (request.scenario === "success" && spentToday + 0.05 > dailyLimit) {
      return {
        capability,
        scenario: request.scenario,
        success: false,
        budget: getBudget(),
        error: { code: "BUDGET_EXCEEDED", message: "Daily mock provider budget is exhausted.", retryable: false },
      };
    }

    switch (request.scenario) {
      case "success": {
        const result = {
          capability,
          scenario: request.scenario,
          success: true,
          result: buildSuccessResult(request),
          cost: buildCost(request),
          budget: getBudget(),
        };
        successful += 1;
        costRecords += 1;
        return result;
      }
      case "unavailable":
        return {
          capability,
          scenario: request.scenario,
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "DataForSEO service unavailable.", retryable: true },
        };
      case "authorization_denial":
        return {
          capability,
          scenario: request.scenario,
          success: false,
          error: { code: "AUTHORIZATION_DENIED", message: "API credentials rejected.", retryable: false },
        };
      case "rejection":
        return {
          capability,
          scenario: request.scenario,
          success: false,
          error: { code: "REJECTED", message: "Request rejected by provider.", retryable: false },
        };
      case "rate_limit":
        return {
          capability,
          scenario: request.scenario,
          success: false,
          error: { code: "RATE_LIMIT", message: "Rate limit exceeded.", retryable: true },
        };
      case "malformed":
        return {
          capability,
          scenario: request.scenario,
          success: false,
          error: { code: "MALFORMED_RESPONSE", message: "Provider returned a malformed response.", retryable: true },
        };
      case "timeout":
        return {
          capability,
          scenario: request.scenario,
          success: false,
          error: { code: "TIMEOUT", message: "Request timed out.", retryable: true },
        };
      case "cancellation":
        return {
          capability,
          scenario: request.scenario,
          success: false,
          error: { code: "CANCELLED", message: "Request was cancelled.", retryable: true },
        };
      default: {
        const _exhaustive: never = request.scenario;
        return {
          capability,
          scenario: _exhaustive,
          success: false,
          error: { code: "UNKNOWN_SCENARIO", message: `Unknown scenario: ${_exhaustive}`, retryable: false },
        };
      }
    }
  }

  return {
    capability,
    execute,
    getBudget,
    getSideEffectCounts: () => ({ attempted, successful, costRecords }),
  };
}

export function createUnconfiguredDataForSeo(): DataForSeoProvider {
  return createMockDataForSeo({ capability: "unconfigured" });
}
