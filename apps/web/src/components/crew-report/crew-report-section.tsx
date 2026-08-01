"use client";

import { useActionState, useEffect, useState } from "react";
import {
  checkCrewReportStatusAction,
  startCrewReportAction,
  type CrewReportActionState,
} from "@/lib/crew-report/actions";
import type { CrewReportResultPayload, CrewReportTool } from "@seovista/worker";

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
 * Email-gated "AI Strateji Raporu" section mounted below the completed
 * content of the four tool result pages. Three states:
 *
 *   1. locked    — email + KVKK consent form (useActionState gate).
 *   2. in-flight — polls `checkCrewReportStatusAction` every 3 s until the
 *      crew report job reaches a terminal status (cleanup on unmount).
 *   3. completed — renders the report region (placeholder swapped for the
 *      bespoke CrewReportView in Task 4); failed/timeout renders a Turkish
 *      error with a retry button returning to the locked gate.
 *
 * Uses an <h2> heading so the one-<h1>-per-page rule is preserved.
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
        fail("Rapor durumu alınamadı. Lütfen tekrar deneyiniz.");
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
            fail("Rapor tamamlandı ancak içeriği okunamadı. Lütfen tekrar deneyiniz.");
          }
          return;
        }

        if (
          status === "failed" ||
          status === "timeout" ||
          status === "permanent" ||
          status === "permanent_failure"
        ) {
          fail("Rapor oluşturulamadı veya zaman aşımına uğradı. Lütfen tekrar deneyiniz.");
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

      fail("Rapor durumu alınamadı. Lütfen tekrar deneyiniz.");
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
      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full"
      data-testid="crew-report-section"
    >
      <h2 id="crew-report-heading" className="text-xl font-bold text-slate-900">
        AI Strateji Raporu
      </h2>

      {phase === "locked" && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Denetim sonucunuza özel AI strateji raporunu oluşturmak için e-posta adresinizi girin.
            Rapor, CrewAgency çok-ajanlı sistemi tarafından üretilir ve bu sayfada görüntülenir.
          </p>
          <form action={formAction} className="mt-4 space-y-4">
            <input type="hidden" name="sourceJobId" value={sourceJobId} />
            <input type="hidden" name="tool" value={tool} />

            <div>
              <label
                htmlFor="crew-report-email"
                className="block text-sm font-medium text-slate-900 mb-1"
              >
                E-posta Adresi
              </label>
              <input
                type="email"
                id="crew-report-email"
                name="email"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                placeholder="siz@sirket.com"
                aria-describedby={
                  state.status === "error" && state.errors?.email
                    ? "crew-report-email-error"
                    : undefined
                }
              />
              {state.status === "error" && state.errors?.email && (
                <p id="crew-report-email-error" className="mt-1 text-sm text-red-600" role="alert">
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
                  className="mt-1 h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  aria-describedby={
                    state.status === "error" && state.errors?.consent
                      ? "crew-report-consent-error"
                      : undefined
                  }
                />
                <label htmlFor="crew-report-consent" className="text-sm text-slate-700">
                  SeoVista&apos;nın AI arama stratejileri ve ürün haberleri hakkında ara sıra
                  e-posta göndermesini kabul ediyorum.
                </label>
              </div>
              {state.status === "error" && state.errors?.consent && (
                <p id="crew-report-consent-error" className="mt-1 text-sm text-red-600" role="alert">
                  {state.errors.consent[0]}
                </p>
              )}
            </div>

            {state.status === "error" && state.errors?.form && (
              <div className="text-red-600 text-sm p-3 bg-red-50 rounded-lg" role="alert">
                {state.errors.form[0]}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {pending ? "Rapor Başlatılıyor..." : "AI Strateji Raporunu Oluştur"}
            </button>
          </form>
        </div>
      )}

      {phase === "in-flight" && (
        <div className="mt-4 flex items-start gap-4" role="status" aria-live="polite">
          <div
            className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin flex-shrink-0"
            aria-hidden="true"
          ></div>
          <div>
            <p className="text-sm font-medium text-slate-900">
              AI strateji raporunuz oluşturuluyor…
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Bu işlem birkaç dakika sürebilir. Rapor hazır olduğunda bu bölümde otomatik olarak
              görüntülenir.
            </p>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="mt-4">
          <p className="text-sm text-red-600 p-3 bg-red-50 rounded-lg" role="alert">
            {failureMessage ?? "Rapor oluşturulamadı. Lütfen tekrar deneyiniz."}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {phase === "completed" && report && (
        // Task 4 replaces this placeholder with the bespoke CrewReportView
        // (custom markdown component map + guardrail badges).
        <div
          data-testid="crew-report-content"
          className="mt-4 text-sm text-slate-700 whitespace-pre-wrap"
        >
          {report.reportMarkdown}
        </div>
      )}
    </section>
  );
}
