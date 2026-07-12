import type { ProviderCapability, ProviderOutcome, ProviderError } from "./types.js";

export type RenderScenario =
  | "success"
  | "unavailable"
  | "rejection"
  | "timeout"
  | "cancellation";

export interface RenderRequest {
  readonly reportId: string;
  readonly format: "html" | "pdf";
  readonly scenario: RenderScenario;
}

export interface RenderResult {
  readonly reportId: string;
  readonly format: "html" | "pdf";
  readonly contentUrl: string;
  readonly renderedAt: string;
}

export interface ReportRenderer {
  readonly capability: ProviderCapability;
  render(request: RenderRequest): Promise<ProviderOutcome<RenderResult>>;
}

export interface MockRendererOptions {
  readonly capability?: ProviderCapability;
  readonly baseUrl?: string;
  readonly now?: Date;
}

export function createMockRenderer(options: MockRendererOptions = {}): ReportRenderer {
  const capability = options.capability ?? "mock";
  const baseUrl = options.baseUrl ?? "https://reports.seovista.local";
  const now = options.now ?? new Date();

  function errorFor(scenario: RenderScenario): ProviderError {
    switch (scenario) {
      case "unavailable":
        return { code: "SERVICE_UNAVAILABLE", message: "Renderer unavailable.", retryable: true };
      case "rejection":
        return { code: "REJECTED", message: "Render request rejected.", retryable: false };
      case "timeout":
        return { code: "TIMEOUT", message: "Render request timed out.", retryable: true };
      case "cancellation":
        return { code: "CANCELLED", message: "Render request was cancelled.", retryable: true };
      case "success":
        return { code: "OK", message: "Success", retryable: false };
      default: {
        const _exhaustive: never = scenario;
        return { code: "UNKNOWN", message: `Unknown scenario: ${_exhaustive}`, retryable: false };
      }
    }
  }

  async function render(request: RenderRequest): Promise<ProviderOutcome<RenderResult>> {
    if (capability === "unconfigured") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNCONFIGURED", message: "Renderer is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured renderer.", retryable: false } };
    }
    if (request.scenario !== "success") {
      return { capability, scenario: request.scenario, success: false, error: errorFor(request.scenario) };
    }
    return {
      capability,
      scenario: request.scenario,
      success: true,
      value: {
        reportId: request.reportId,
        format: request.format,
        contentUrl: `${baseUrl}/${request.reportId}.${request.format}`,
        renderedAt: now.toISOString(),
      },
    };
  }

  return {
    capability,
    render,
  };
}

export function createUnconfiguredRenderer(options: Omit<MockRendererOptions, "capability"> = {}): ReportRenderer {
  return createMockRenderer({ ...options, capability: "unconfigured" });
}
