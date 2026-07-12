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
  readonly now?: Date;
}

export function createMockDataForSeo(options: MockDataForSeoOptions = {}): DataForSeoProvider {
  const capability = options.capability ?? "mock";
  const dailyLimit = options.dailyLimit ?? 100;
  const currency = options.currency ?? "USD";
  const now = options.now ?? new Date();
  let spentToday = 0;

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
      completedAt: now.toISOString(),
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
      recordedAt: now.toISOString(),
    };
  }

  async function execute(request: DataForSeoRequest): Promise<DataForSeoOutcome> {
    if (capability === "unconfigured") {
      return {
        capability,
        scenario: request.scenario,
        success: false,
        error: { code: "UNCONFIGURED", message: "DataForSEO provider is not configured.", retryable: false },
      };
    }

    if (capability !== "mock") {
      return {
        capability,
        scenario: request.scenario,
        success: false,
        error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured capability.", retryable: false },
      };
    }

    switch (request.scenario) {
      case "success": {
        return {
          capability,
          scenario: request.scenario,
          success: true,
          result: buildSuccessResult(request),
          cost: buildCost(request),
          budget: getBudget(),
        };
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
  };
}

export function createUnconfiguredDataForSeo(): DataForSeoProvider {
  return createMockDataForSeo({ capability: "unconfigured" });
}
