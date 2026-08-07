"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkJobStatusAction } from "@/lib/geo-checker/actions";
import {
  isAuditInFlightStatus,
  isAuditTerminalStatus,
  type AuditInFlightStatus,
} from "@/lib/geo-checker/audit-status";
import { AUDIT_POLL_TIMEOUT_MS, hasAuditPollingExpired } from "./audit-polling";

/**
 * The supported in-flight lifecycle statuses that the poller knows how to
 * visualise. Any value outside this union is treated as an explicit
 * unavailable state rather than being silently coerced to "queued" or
 * "running".
 */

function statusLabel(s: string): string {
  switch (s) {
    case "queued":
      return "Audit in queue…";
    case "running":
      return "Running audit…";
    case "pending":
      return "Audit pending";
    default:
      return "Audit status unavailable";
  }
}

export interface AuditPollerProps {
  jobId: string;
  /**
   * The exact persisted initial status as returned by the server on first
   * render. The component starts from this value so the UI never flashes a
   * different state (e.g. "queued") before the first poll resolves.
   */
  initialStatus?: AuditInFlightStatus;
}

export function AuditPoller({ jobId, initialStatus }: AuditPollerProps) {
  const router = useRouter();

  const hasKnownInitialStatus = initialStatus === undefined || isAuditInFlightStatus(initialStatus);
  const resolvedInitial: AuditInFlightStatus | "unavailable" = hasKnownInitialStatus
    ? (initialStatus ?? "queued")
    : "unavailable";

  const [status, setStatus] = useState<AuditInFlightStatus | "timeout" | "unavailable">(resolvedInitial);
  
  useEffect(() => {
    if (resolvedInitial === "unavailable") return;

    let pollTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const startedAt = Date.now();

    const stopAfterTimeout = () => {
      if (!active) return;
      active = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      setStatus("timeout");
    };

    const poll = async () => {
      if (!active) return;
      if (hasAuditPollingExpired(startedAt, Date.now())) {
        stopAfterTimeout();
        return;
      }

      let result: Awaited<ReturnType<typeof checkJobStatusAction>>;
      try {
        result = await checkJobStatusAction(jobId);
      } catch {
        if (!active) return;
        active = false;
        if (pollTimeoutId) clearTimeout(pollTimeoutId);
        if (deadlineTimeoutId) clearTimeout(deadlineTimeoutId);
        setStatus("unavailable");
        return;
      }
      if (!active) return;

      if (hasAuditPollingExpired(startedAt, Date.now())) {
        stopAfterTimeout();
        return;
      }

      if (result.success && result.data) {
        const pollingStatus = result.data.status;

        if (isAuditTerminalStatus(pollingStatus)) {
          active = false;
          if (deadlineTimeoutId) clearTimeout(deadlineTimeoutId);
          router.refresh();
          return;
        }

        if (isAuditInFlightStatus(pollingStatus)) {
          setStatus(pollingStatus);
          pollTimeoutId = setTimeout(poll, 2000);
          return;
        }

        active = false;
        if (deadlineTimeoutId) clearTimeout(deadlineTimeoutId);
        setStatus("unavailable");
      } else {
        active = false;
        if (deadlineTimeoutId) clearTimeout(deadlineTimeoutId);
        setStatus("unavailable");
      }
    };

    deadlineTimeoutId = setTimeout(stopAfterTimeout, AUDIT_POLL_TIMEOUT_MS);
    void poll();

    return () => {
      active = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      if (deadlineTimeoutId) clearTimeout(deadlineTimeoutId);
    };
  }, [jobId, router, resolvedInitial]);

  const timedOut = status === "timeout";
  const isUnavailable = status === "unavailable";

  return (
    <div className="flex flex-col items-center justify-center p-12 bg-paper rounded-lg border border-hairline">
      {!timedOut && !isUnavailable && (
        <div className="w-16 h-16 border-4 border-spectral/20 border-t-spectral rounded-full animate-spin mb-6"></div>
      )}
      <h3 className="text-xl font-medium text-ink mb-2">
        {timedOut
          ? "Audit polling timed out"
          : isUnavailable
            ? "Audit status unavailable"
            : statusLabel(status)}
      </h3>
      <p className="text-muted-ink text-center max-w-sm">
        {timedOut
          ? `The audit did not finish within ${AUDIT_POLL_TIMEOUT_MS / 60000} minutes. Please refresh later.`
          : isUnavailable
            ? "The audit result status could not be determined. Please refresh the page or try again later."
            : "We are scanning your domain and analyzing AI Search visibility. This typically takes a moment."}
      </p>
    </div>
  );
}
