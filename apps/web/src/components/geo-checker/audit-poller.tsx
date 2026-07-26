"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkJobStatusAction } from "@/lib/geo-checker/actions";
import { AUDIT_POLL_TIMEOUT_MS, hasAuditPollingExpired } from "./audit-polling";

export function AuditPoller({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("queued");
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    let active = true;
    const startedAt = Date.now();

    const stopAfterTimeout = () => {
      if (active) setStatus("timeout");
    };

    const poll = async () => {
      if (!active) return;
      if (hasAuditPollingExpired(startedAt, Date.now())) {
        stopAfterTimeout();
        return;
      }

      const result = await checkJobStatusAction(jobId);
      if (!active) return;

      if (hasAuditPollingExpired(startedAt, Date.now())) {
        stopAfterTimeout();
        return;
      }

      if (result.success && result.data) {
        setStatus(result.data.status);
        
        if (result.data.status === "completed" || result.data.status === "failed") {
          router.refresh();
        } else {
          timeoutId = setTimeout(poll, 2000);
        }
      } else {
        timeoutId = setTimeout(poll, 2000);
      }
    };

    void poll();

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [jobId, router]);

  const timedOut = status === "timeout";

  return (
    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow-sm border border-slate-200">
      {!timedOut && <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>}
      <h3 className="text-xl font-medium text-slate-800 mb-2">
        {timedOut ? "Audit polling timed out" : status === "queued" ? "Audit in queue..." : "Running audit..."}
      </h3>
      <p className="text-slate-500 text-center max-w-sm">
        {timedOut
          ? `The audit did not finish within ${AUDIT_POLL_TIMEOUT_MS / 60000} minutes. Please refresh later.`
          : "We are scanning your domain and analyzing AI Search visibility. This typically takes a moment."}
      </p>
    </div>
  );
}
