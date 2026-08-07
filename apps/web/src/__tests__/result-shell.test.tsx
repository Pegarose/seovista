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
  VerdictCard,
  IssueLedger,
  UnknownJobStatusView,
} from "@/components/result-pages";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

// ---------------------------------------------------------------------------
// UnknownJobStatusView — single main/h1 + Try again link
// ---------------------------------------------------------------------------

describe("UnknownJobStatusView", () => {
  it("renders exactly one <main>, one <h1> with the English copy, and a Try again link to /tools/", () => {
    const markup = renderToStaticMarkup(<UnknownJobStatusView />);

    expect(countTag(markup, "main")).toBe(1);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain("We can&#x27;t find this report");
    expect(markup).toContain("Start a new audit to get a fresh link");
    expect(markup).toContain('href="/tools/"');
    expect(markup).toContain("Try again");
  });
});

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

// ---------------------------------------------------------------------------
// VerdictCard — variant pill, score block, design-token classes only
// ---------------------------------------------------------------------------

describe("VerdictCard", () => {
  const variants: Array<[string, string, string]> = [
    ["pass", "Pass", "text-signal"],
    ["warn", "Warning", "text-ember"],
    ["fail", "Fail", "text-ember"],
    ["info", "Info", "text-spectral"],
  ];

  it.each(variants)("renders %s pill with %s label and %s token, no slate-", (variant, label, tokenClass) => {
    const markup = renderToStaticMarkup(
      <VerdictCard variant={variant as "pass"} title="Title" summary="Summary." />,
    );

    expect(markup).toContain(label);
    expect(markup).toContain(tokenClass);
    // No slate/gray/indigo utilities anywhere in the rendered output.
    expect(markup).not.toMatch(/slate-|gray-|indigo-/);
  });

  it("renders the score with the expected aria-label when score is set", () => {
    const markup = renderToStaticMarkup(
      <VerdictCard
        variant="pass"
        title="Title"
        summary="Summary."
        score={85}
      />,
    );

    expect(markup).toContain('aria-label="Score: 85 out of 100"');
    expect(markup).toContain("/100");
  });

  it("renders no score block when score is omitted", () => {
    const markup = renderToStaticMarkup(
      <VerdictCard variant="info" title="Title" summary="Summary." />,
    );

    expect(markup).not.toContain("out of 100");
    expect(markup).not.toContain("/100");
  });
});

// ---------------------------------------------------------------------------
// IssueLedger — heading, severity tone, source link, empty state
// ---------------------------------------------------------------------------

describe("IssueLedger", () => {
  it("renders the heading, a severity-toned index, and the source href", () => {
    const items: Array<{
      id: string;
      severity: "pass" | "warn" | "fail" | "info";
      title: string;
      detail: string;
      source?: { label: string; url: string };
    }> = [
      { id: "a", severity: "fail", title: "Missing alt text", detail: "Three images lack alt." },
      {
        id: "b",
        severity: "pass",
        title: "Canonical present",
        detail: "Canonical URL is set.",
        source: { label: "example.com", url: "https://example.com/" },
      },
      { id: "c", severity: "info", title: "Duplicate meta", detail: "Two meta descriptions." },
    ];

    const markup = renderToStaticMarkup(
      <IssueLedger heading="Evidence ledger" items={items} />,
    );

    expect(markup).toContain("<h2");
    expect(markup).toContain("Evidence ledger");
    expect(markup).toContain("text-ember"); // severity tone on a fail row index
    expect(markup).toContain('href="https://example.com/"');
    expect(markup).toContain("example.com");
  });

  it("renders the empty-state text when items is empty", () => {
    const markup = renderToStaticMarkup(
      <IssueLedger heading="Evidence ledger" items={[]} />,
    );

    expect(markup).toContain("No issues found.");
  });
});
