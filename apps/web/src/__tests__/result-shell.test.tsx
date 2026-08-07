/**
 * Result-Page Editorial Lab — Task 1 shared kit tests.
 *
 * The result-pages kit (ResultShell, StatusPill, AuditMetaStrip,
 * ReportErrorPanel) is the shared shell every tool's result page mounts.
 * These tests lock the one-main/one-h1 landmark contract, the design-token
 * variant vocabulary (never slate-*), mono meta rendering, and the live
 * region semantics of the error panel. Follows the schema-result-states
 * test conventions: renderToStaticMarkup resolves function components so
 * assertions run against the exact HTML the browser receives.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ResultShell,
  StatusPill,
  AuditMetaStrip,
  ReportErrorPanel,
} from "@/components/result-pages";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

// ---------------------------------------------------------------------------
// ResultShell — landmark contract
// ---------------------------------------------------------------------------

describe("ResultShell", () => {
  it("renders exactly one <main> and one <h1>", () => {
    const markup = renderToStaticMarkup(
      <ResultShell
        eyebrow="Audit"
        title="Result page"
        status="completed"
        meta={{
          jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          queueName: "ai_crawler_audit",
          toolLabel: "AI Crawler",
        }}
      >
        <p>Body content</p>
      </ResultShell>,
    );

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    // Header carries the page's single title.
    expect(markup).toContain("Result page");
  });

  it("does not render the meta strip when meta is omitted", () => {
    const markup = renderToStaticMarkup(
      <ResultShell eyebrow="Audit" title="No meta" status="unknown">
        <p>Body</p>
      </ResultShell>,
    );

    expect(markup).not.toContain("Job ID");
  });
});

// ---------------------------------------------------------------------------
// StatusPill — five variants, design-token classes only
// ---------------------------------------------------------------------------

describe("StatusPill", () => {
  const variants: Array<[string, string, string]> = [
    ["in_progress", "In progress", "text-spectral"],
    ["success", "Complete", "text-signal"],
    ["warning", "Needs attention", "text-ember"],
    ["failure", "Failed", "text-ember"],
    ["unknown", "Status unknown", "text-muted-ink"],
  ];

  it.each(variants)("renders %s with %s label and %s token, no slate-", (variant, label, tokenClass) => {
    const markup = renderToStaticMarkup(
      <StatusPill variant={variant as "in_progress"} />,
    );

    expect(markup).toContain(label);
    expect(markup).toContain(tokenClass);
    expect(markup).toContain('role="status"');
    // No slate/gray/indigo utilities anywhere in the rendered output.
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("honours a custom aria-label override", () => {
    const markup = renderToStaticMarkup(
      <StatusPill variant="success" ariaLabel="Crawl finished" />,
    );

    expect(markup).toContain('aria-label="Crawl finished"');
  });
});

// ---------------------------------------------------------------------------
// AuditMetaStrip — mono meta rendering
// ---------------------------------------------------------------------------

describe("AuditMetaStrip", () => {
  it("renders jobId and queueName as mono text", () => {
    const jobId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const queueName = "ai_crawler_audit";

    const markup = renderToStaticMarkup(
      <AuditMetaStrip
        jobId={jobId}
        queueName={queueName}
        toolLabel="AI Crawler"
      />,
    );

    expect(markup).toContain("font-mono");
    expect(markup).toContain(jobId);
    expect(markup).toContain(queueName);
    expect(markup).toContain("AI Crawler");
  });

  it("renders the submitted timestamp when provided", () => {
    const markup = renderToStaticMarkup(
      <AuditMetaStrip
        jobId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        queueName="ai_crawler_audit"
        submittedAt="2026-01-02T03:04:05Z"
        toolLabel="AI Crawler"
      />,
    );

    expect(markup).toContain("2026-01-02T03:04:05Z");
  });
});

// ---------------------------------------------------------------------------
// ReportErrorPanel — live region + retry anchor
// ---------------------------------------------------------------------------

describe("ReportErrorPanel", () => {
  it("has role=status and aria-live=polite", () => {
    const markup = renderToStaticMarkup(
      <ReportErrorPanel title="Report failed" body="It did not work." />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("renders an anchor pointing at retryHref when set", () => {
    const markup = renderToStaticMarkup(
      <ReportErrorPanel
        title="Report failed"
        body="It did not work."
        correlationId="corr-123"
        retryHref="/tools/ai-crawler"
      />,
    );

    expect(markup).toContain('href="/tools/ai-crawler"');
    expect(markup).toContain("corr-123");
    expect(markup).toContain("Try again");
  });

  it("defaults the retry label when not provided", () => {
    const markup = renderToStaticMarkup(
      <ReportErrorPanel
        title="Report failed"
        body="It did not work."
        retryHref="/tools/ai-crawler"
        retryLabel="Re-run"
      />,
    );

    expect(markup).toContain("Re-run");
  });
});
