"use client";

import { useActionState, useEffect, useState } from "react";
import {
  checkCrewReportStatusAction,
  startCrewReportAction,
  type CrewReportActionState,
} from "@/lib/crew-report/actions";
import type { CrewReportResultPayload, CrewReportTool } from "@seovista/worker";
import { CrewReportView } from "./crew-report-view";

/** Polling interval for the in-flight crew report status check. */
const POLL_INTERVAL_MS = 3_000;

type SectionPhase = "locked" | "in-flight" | "completed" | "failed";

export interface CrewReportSectionProps {
  /** The completed source audit job the report is generated from. */
  sourceJobId: string;
  /** Tool whose source result seeds the report. */
  tool: CrewReportTool;
}

/**
 * Email-gated "AI Strategy Report" section mounted below the completed
 * content of the four tool result pages. Three states:
 *
 *   1. locked    — email + consent form (useActionState gate).
 *   2. in-flight — polls `checkCrewReportStatusAction` every 3 s until the
 *      crew report job reaches a terminal status (cleanup on unmount).
 *   3. completed — renders the bespoke CrewReportView (custom markdown
 *      component map + guardrail badges); failed/timeout renders an English
 *      error with a retry button returning to the locked gate.
 *
 * Uses an <h2> heading so the one-<h1>-per-page rule is preserved.
 *
 * Action-layer error copy (`state.errors.*`) comes from the server action
 * (`src/lib/crew-report/actions.ts`) and stays as-is — it is action data,
 * not a component constant.
 */
export function CrewReportSection({ sourceJobId, tool }: CrewReportSectionProps) {
  const [phase, setPhase] = useState<SectionPhase>("locked");
  const [crewJobId, setCrewJobId] = useState<string | null>(null);
  const [report, setReport] = useState<CrewReportResultPayload | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: CrewReportActionState, formData: FormData) => {
      const result = await startCrewReportAction(prev, formData);
      if (result.status === "started" && result.crewJobId) {
        setCrewJobId(result.crewJobId);
        setFailureMessage(null);
        setPhase("in-flight");
      }
      return result;
    },
    { status: "idle" }
  );

  useEffect(() => {
    if (phase !== "in-flight" || !crewJobId) return;

    let active = true;
    let pollTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      active = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
    };

    const fail = (message: string) => {
      stop();
      setFailureMessage(message);
      setPhase("failed");
    };

    const poll = async () => {
      if (!active) return;

      let result: Awaited<ReturnType<typeof checkCrewReportStatusAction>>;
      try {
        result = await checkCrewReportStatusAction(crewJobId);
      } catch {
        if (!active) return;
        fail("Could not read the report status. Please try again.");
        return;
      }
      if (!active) return;

      if (result.success && result.data) {
        const status = result.data.status;

        if (status === "completed") {
          if (result.data.report) {
            stop();
            setReport(result.data.report);
            setPhase("completed");
          } else {
            fail("The report finished, but its content could not be read. Please try again.");
          }
          return;
        }

        if (
          status === "failed" ||
          status === "timeout" ||
          status === "permanent" ||
          status === "permanent_failure"
        ) {
          fail("The report failed or timed out. Please try again.");
          return;
        }

        // queued / running / pending / unknown → keep polling.
        pollTimeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      if (result.success) {
        // The job row is not visible yet (freshly submitted) → keep polling.
        pollTimeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      fail("Could not read the report status. Please try again.");
    };

    void poll();

    return () => {
      active = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
    };
  }, [phase, crewJobId]);

  const handleRetry = () => {
    setReport(null);
    setCrewJobId(null);
    setFailureMessage(null);
    setPhase("locked");
  };

  return (
    <section
      aria-labelledby="crew-report-heading"
      className="bg-paper p-6 rounded-xl border border-hairline w-full"
      data-testid="crew-report-section"
    >
      <h2 id="crew-report-heading" className="text-xl font-bold text-ink">
        AI Strategy Report
      </h2>

      {phase === "locked" && (
        <div className="mt-4">
          <p className="text-sm text-muted-ink">
            Enter your email to generate an AI strategy report tailored to this audit.
            The report is produced by the CrewAgency multi-agent system and displayed on this page.
          </p>
          <form action={formAction} className="mt-4 space-y-4">
            <input type="hidden" name="sourceJobId" value={sourceJobId} />
            <input type="hidden" name="tool" value={tool} />

            <div>
              <label
                htmlFor="crew-report-email"
                className="block text-sm font-medium text-ink mb-1"
              >
                Email address
              </label>
              <input
                type="email"
                id="crew-report-email"
                name="email"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-lg border border-hairline focus:outline-none focus:ring-2 focus:ring-spectral focus:border-transparent transition-shadow"
                placeholder="you@company.com"
                aria-describedby={
                  state.status === "error" && state.errors?.email
                    ? "crew-report-email-error"
                    : undefined
                }
              />
              {state.status === "error" && state.errors?.email && (
                <p id="crew-report-email-error" className="mt-1 text-sm text-ember" role="alert">
                  {state.errors.email[0]}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="crew-report-consent"
                  name="consent"
                  value="true"
                  className="mt-1 h-4 w-4 text-spectral rounded border-hairline focus:ring-spectral"
                  aria-describedby={
                    state.status === "error" && state.errors?.consent
                      ? "crew-report-consent-error"
                      : undefined
                  }
                />
                <label htmlFor="crew-report-consent" className="text-sm text-muted-ink">
                  I agree to receive occasional emails from SeoVista about AI search
                  strategies and product news.
                </label>
              </div>
              {state.status === "error" && state.errors?.consent && (
                <p id="crew-report-consent-error" className="mt-1 text-sm text-ember" role="alert">
                  {state.errors.consent[0]}
                </p>
              )}
            </div>

            {state.status === "error" && state.errors?.form && (
              <div className="text-ember text-sm p-3 bg-mineral rounded-lg" role="alert">
                {state.errors.form[0]}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-ink hover:bg-mineral disabled:opacity-60 text-paper font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {pending ? "Generating report..." : "Create AI Strategy Report"}
            </button>
          </form>
        </div>
      )}

      {phase === "in-flight" && (
        <div className="mt-4 flex items-start gap-4" role="status" aria-live="polite">
          <div
            className="w-8 h-8 border-4 border-hairline border-t-spectral rounded-full animate-spin flex-shrink-0"
            aria-hidden="true"
          ></div>
          <div>
            <p className="text-sm font-medium text-ink">
              Your AI strategy report is being generated…
            </p>
            <p className="text-sm text-muted-ink mt-1">
              This can take a few minutes. The report will appear here automatically when ready.
            </p>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="mt-4">
          <p className="text-sm text-ember p-3 bg-mineral rounded-lg" role="alert">
            {failureMessage ?? "The report could not be generated. Please try again."}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-3 bg-ink hover:bg-mineral text-paper font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {phase === "completed" && report && (
        <div data-testid="crew-report-content" className="mt-4">
          <CrewReportView report={report} />
        </div>
      )}
    </section>
  );
}
