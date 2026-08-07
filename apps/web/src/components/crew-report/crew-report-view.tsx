import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CrewReportResultPayload } from "@seovista/worker";
import {
  GUARDRAIL_LABELS,
  transformGuardrailLabels,
  type GuardrailTone,
} from "./guardrail";

/**
 * Bespoke markdown renderer for the CrewAgency AI strategy report.
 *
 * - Raw HTML stays disabled (no rehype raw): script/img injection in the
 *   AI-generated markdown is escaped, never executed.
 * - Known guardrail labels (`[SİMÜLASYON]` etc.) are pre-transformed by
 *   `transformGuardrailLabels` into `**⟦G:…⟧**` and rendered by the custom
 *   `strong` renderer as text + color badge chips (WCAG 2.1 AA — the badge
 *   always carries its English label text and a `title` description, never
 *   color alone). The guardrail KEYS stay Turkish-uppercase because the crew
 *   emits the bracket markers in that form; only the rendered label text is
 *   English.
 * - Heading levels are capped at h2/h3: the report lives inside the result
 *   page (which owns the only h1) and below the section's own h2.
 */

/** Tailwind classes per guardrail tone (badge = text + color, never color-only). */
const TONE_CLASSES: Record<GuardrailTone, string> = {
  amber: "border-ember/40 bg-mineral text-ember",
  blue: "border-spectral/40 bg-mineral text-spectral",
  red: "border-ember/40 bg-mineral text-ember",
  green: "border-signal/40 bg-mineral text-signal",
  slate: "border-hairline bg-mineral text-muted-ink",
};

/** Matches the strong marker produced by `transformGuardrailLabels`. */
const GUARDRAIL_MARKER_PATTERN = /^⟦G:(.+)⟧$/u;

/** Recursively flattens React children to plain text. */
function flattenText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (React.isValidElement(node)) {
    return flattenText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function GuardrailBadge({ name }: { name: string }) {
  const meta = GUARDRAIL_LABELS[name];
  if (!meta) return null;
  return (
    <span
      data-guardrail={name}
      title={meta.description}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold align-baseline ${TONE_CLASSES[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}

const components: Components = {
  // Heading levels are demoted so the view never emits an <h1> and stays
  // below the section's <h2> in the document outline.
  h1: ({ children }) => (
    <h2 className="font-serif text-xl font-bold text-ink mt-6">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-xl font-bold text-ink mt-6">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-ink mt-4">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-ink mt-3">{children}</h4>
  ),
  p: ({ children }) => <p className="text-sm text-muted-ink leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1 text-sm text-muted-ink marker:text-muted-ink">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-ink marker:text-muted-ink">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-paper">
      <table className="min-w-full divide-y divide-hairline text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-mineral">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-sm text-muted-ink border-t border-hairline">
      {children}
    </td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-ember/50 bg-mineral px-4 py-2 text-sm text-ember rounded-r-lg">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-ink p-4 text-xs text-paper [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-paper">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-mineral px-1 py-0.5 font-mono text-xs text-ink">
      {children}
    </code>
  ),
  // Outbound links from AI content: kept clickable but always nofollow +
  // noopener and opened in a new tab.
  a: ({ href, children }) => (
    <a
      href={href}
      rel="nofollow noopener"
      target="_blank"
      className="text-spectral underline break-all hover:text-spectral/80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => {
    const marker = GUARDRAIL_MARKER_PATTERN.exec(flattenText(children).trim());
    const name = marker?.[1];
    if (name && Object.prototype.hasOwnProperty.call(GUARDRAIL_LABELS, name)) {
      return <GuardrailBadge name={name} />;
    }
    return <strong className="font-semibold text-ink">{children}</strong>;
  },
};

export interface CrewReportViewProps {
  /** The persisted `crew-report:result` payload. */
  report: Pick<CrewReportResultPayload, "reportMarkdown" | "generatedAt" | "endpoint">;
}

/**
 * Renders the AI strategy report with a header band (CrewAgency attribution,
 * generation timestamp, AI-content disclaimer referencing the guardrail
 * labels) followed by the guardrail-transformed markdown body.
 */
export function CrewReportView({ report }: CrewReportViewProps) {
  const body = transformGuardrailLabels(report.reportMarkdown);

  return (
    <div className="crew-report-view">
      <header className="mb-4 rounded-lg border border-hairline bg-mineral p-4">
        <p className="text-xs font-medium text-muted-ink">
          CrewAgency multi-agent system · generated: {report.generatedAt}
        </p>
        <p className="mt-1 text-xs text-muted-ink leading-relaxed">
          This report was generated by AI. The Simulation, Forecast, Missing Data, Decision
          Needed, and Calculated labels indicate the confidence level of the statements they
          mark; review labeled sections before making decisions.
        </p>
      </header>
      <div className="space-y-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
