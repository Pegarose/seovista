/**
 * Typed DataForSEO provider contract and cost ledger. Sprint 0 uses
 * deterministic mocks only; no live provider traffic is made.
 */

export type DataForSeoCapability = "mock" | "unconfigured" | "live";

export type DataForSeoScenario =
  | "success"
  | "unavailable"
  | "authorization_denial"
  | "rejection"
  | "rate_limit"
  | "malformed"
  | "timeout"
  | "cancellation";

export interface NormalizedResult {
  readonly taskId: string;
  readonly target: string;
  readonly completedAt: string;
  readonly checks: readonly NormalizedCheck[];
  readonly limitations: readonly string[];
}

export interface NormalizedCheck {
  readonly name: string;
  readonly category: string;
  readonly passed: boolean;
  readonly value: number | string | boolean | null;
  readonly severity: "info" | "warning" | "error";
  readonly evidence: readonly string[];
}

export interface CostRecord {
  readonly requestId: string;
  readonly provider: "dataforseo";
  readonly operation: string;
  readonly amount: number;
  readonly currency: string;
  readonly recordedAt: string;
}

export interface BudgetState {
  readonly dailyLimit: number;
  readonly spentToday: number;
  readonly currency: string;
  readonly remaining: number;
}

export interface DataForSeoRequest {
  readonly taskId: string;
  readonly target: string;
  readonly operation: string;
  readonly scenario: DataForSeoScenario;
}

export interface DataForSeoOutcome {
  readonly capability: DataForSeoCapability;
  readonly scenario: DataForSeoScenario;
  readonly success: boolean;
  readonly result?: NormalizedResult | undefined;
  readonly cost?: CostRecord | undefined;
  readonly budget?: BudgetState | undefined;
  readonly error?: { code: string; message: string; retryable: boolean } | undefined;
}

export interface DataForSeoProvider {
  readonly capability: DataForSeoCapability;
  execute(request: DataForSeoRequest): Promise<DataForSeoOutcome>;
  getBudget(): BudgetState;
}
