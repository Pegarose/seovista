export type GeoReadinessMethodologyVersion = "0.1.0" | "v1.0" | "v1.1";

export interface GeoReadinessScores {
  overall: number;
  access: number;
  understanding: number;
  evidence: number;
  authorityReadiness?: number;
}

export interface GeoReadinessCheck {
  id: string;
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
  details?: string;
  module: string;
}

export interface GeoReadinessPriority {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

export interface GeoReadinessLimitation {
  id: string;
  description: string;
  scope: "methodology" | "data" | "system";
}

export interface GeoReadinessResult {
  methodologyVersion: string;
  auditedAt: string;
  target: string;
  scores: GeoReadinessScores;
  checks: GeoReadinessCheck[];
  priorities: GeoReadinessPriority[];
  limitations: readonly GeoReadinessLimitation[];
}

export interface PassFailRule {
  checkId: string;
  threshold: number;
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
}

export interface ScoringConfiguration {
  version: string;
  weights: {
    readonly access: number;
    readonly understanding: number;
    readonly evidence: number;
    readonly authorityReadiness: number;
  };
  passFailRules: readonly PassFailRule[];
  maxScore: number;
  limitations: readonly GeoReadinessLimitation[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'experimental';
export type ModuleStatus = 'excellent' | 'good' | 'needs_improvement' | 'poor' | 'critical';

export interface ScoreOptions {
  includeNeuronWriter: boolean;
  includePerformance: boolean;
  includeAiVisibility: boolean;
  renderJavascript: boolean;
  storeSnapshot: boolean;
}

export interface ParsedPage {
  statusCode: number;
  headers: Record<string, string>;
  title?: string;
  metaDescription?: string;
  canonical?: string;
  metaRobots?: { noindex: boolean; nofollow: boolean };
  headings: { level: number; text: string }[];
  links: { href: string; text: string; isInternal: boolean }[];
  images: { src: string; alt?: string }[];
  jsonLd: any[];
  og?: Record<string, string>;
  twitter?: Record<string, string>;
  rawHtml: string;
  textContent: string;
}

export interface ScoreContext {
  tenantId: string;
  siteId?: string | null;
  url?: string;
  normalizedUrl?: string;
  targetKeyword?: string;
  locale?: string;
  pageType?: string;
  platform?: string;
  options?: ScoreOptions;
  parsed: ParsedPage;
  enrichments?: Record<string, unknown>[];
}

export interface AuditIssue {
  code: string;
  title: string;
  severity: Severity;
  module: string;
  impact: string;
  evidence: any;
  recommendation: string;
  implementationHint?: string;
  confidence: number;
}

export interface Recommendation {
  code: string;
  title: string;
  module: string;
  severity: Severity;
  recommendation: string;
  implementationHint?: string | undefined;
  estimatedEffort: 'low' | 'medium' | 'high';
  estimatedImpact: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface AiVisibilityData {
  answerability: number;
  citationReadiness: number;
  entityClarity: number;
  aiParseability: number;
  sourceTrustSignals: number;
  platformReadiness: {
    platform: string;
    score: number;
    confidence: number;
    rationale: string;
    experimental: boolean;
  }[];
}

export interface ScoreModuleResult {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  status: ModuleStatus;
  issues: AuditIssue[];
  recommendations: Recommendation[];
  aiVisibilityData?: AiVisibilityData;
  semanticAnalysisData?: Record<string, unknown>;
}

export interface ScoreModule {
  key: string;
  label: string;
  maxScore: number;
  run(context: ScoreContext): Promise<ScoreModuleResult>;
}
