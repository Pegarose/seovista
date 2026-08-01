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
 *   always carries its Turkish label text and a `title` description, never
 *   color alone).
 * - Heading levels are capped at h2/h3: the report lives inside the result
 *   page (which owns the only h1) and below the section's own h2.
 */

/** Tailwind classes per guardrail tone (badge = text + color, never color-only). */
const TONE_CLASSES: Record<GuardrailTone, string> = {
  amber: "border-amber-300 bg-amber-100 text-amber-800",
  blue: "border-blue-300 bg-blue-100 text-blue-800",
  red: "border-red-300 bg-red-100 text-red-800",
  green: "border-green-300 bg-green-100 text-green-800",
  slate: "border-slate-300 bg-slate-100 text-slate-700",
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
    <h2 className="font-display text-xl font-bold text-slate-900 mt-6">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="font-display text-xl font-bold text-slate-900 mt-6">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-slate-900 mt-4">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-slate-900 mt-3">{children}</h4>
  ),
  p: ({ children }) => <p className="text-sm text-slate-700 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 marker:text-slate-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700 marker:text-slate-400">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-900">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-sm text-slate-700 border-t border-slate-100">
      {children}
    </td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 rounded-r-lg">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-slate-100">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800">
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
      className="text-indigo-600 underline break-all hover:text-indigo-700"
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
    return <strong className="font-semibold text-slate-900">{children}</strong>;
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
      <header className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-600">
          CrewAgency multi-agent sistemi · üretim: {report.generatedAt}
        </p>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Bu rapor yapay zeka tarafından üretilmiştir. Simülasyon, Tahmin, Veri Eksik, Karar
          Gerekli ve Hesaplanan etiketleri ilgili ifadelerin güven düzeyini gösterir; karar
          vermeden önce etiketli bölümleri gözden geçiriniz.
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
