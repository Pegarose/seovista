import React from "react";
import type { ParsedPreview } from "@/lib/geo-checker/payload-parser";

export type SerpPreviewProps = ParsedPreview;

function provenanceLabel(value: ParsedPreview["freshness"] | ParsedPreview["outcome"]): string {
  switch (value) {
    case "fresh":
      return "fresh";
    case "stale":
      return "stale";
    case "no_results":
      return "no results";
    case "expired":
      return "expired";
    case "unavailable":
      return "unavailable";
    case "revoked":
      return "revoked";
    case "success":
      return "success";
    case "partial":
      return "partial";
    default:
      return "unavailable";
  }
}

export function SerpPreview({
  url,
  title,
  snippet,
  displayType,
  sourceMode,
  provider,
  fixtureId,
  requestId,
  operationKey,
  runId,
  capturedAt,
  ttlSeconds,
  freshness,
  outcome,
}: SerpPreviewProps): React.ReactElement {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  if (displayType === "ai") {
    return (
      <div className="rounded-xl border border-spectral/20 bg-spectral/10 p-5 transition-all">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-spectral text-white">
            AI Overview Citation Preview
          </span>
          <span className="text-xs text-muted-ink font-mono">{hostname}</span>
        </div>
        <p className="text-sm text-ink leading-relaxed font-normal">
          {snippet}
        </p>
        <div className="mt-3 pt-3 border-t border-spectral/20 flex flex-col gap-1 text-xs text-spectral font-medium">
          <span>Source: {title}</span>
          <span>Provider: {provider} ({sourceMode})</span>
          <span>Fixture: {fixtureId}</span>
          <span>Request: {requestId}</span>
          <span>Operation: {operationKey}</span>
          <span>Run: {runId}</span>
          <span>Captured: {capturedAt}</span>
          <span>Freshness: {provenanceLabel(freshness)}</span>
          <span>Outcome: {provenanceLabel(outcome)}</span>
          <span>TTL: {ttlSeconds}s</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-paper p-5 font-sans">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-mineral text-ink">
          SERP Preview
        </span>
        <span className="text-xs text-muted-ink font-mono">{hostname}</span>
      </div>
      <div className="text-xs text-muted-ink mb-1 flex items-center gap-1.5 font-mono truncate">
        <span className="w-4 h-4 rounded-full bg-mineral inline-block flex-shrink-0" />
        <span>{url}</span>
      </div>
      <h3 className="text-lg font-medium text-spectral hover:underline cursor-pointer truncate mb-1">
        {title}
      </h3>
      <p className="text-sm text-muted-ink leading-normal line-clamp-2">
        {snippet}
      </p>
      <div className="mt-3 pt-3 border-t border-hairline flex flex-col gap-1 text-xs text-muted-ink">
        <span>Provider: {provider} ({sourceMode})</span>
        <span>Fixture: {fixtureId}</span>
        <span>Request: {requestId}</span>
        <span>Operation: {operationKey}</span>
        <span>Run: {runId}</span>
        <span>Captured: {capturedAt}</span>
        <span>Freshness: {provenanceLabel(freshness)}</span>
        <span>Outcome: {provenanceLabel(outcome)}</span>
        <span>TTL: {ttlSeconds}s</span>
      </div>
    </div>
  );
}
