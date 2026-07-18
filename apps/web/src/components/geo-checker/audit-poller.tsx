"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AuditPoller({ jobId, pollAction }: { jobId: string, pollAction: (id: string) => Promise<string> }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("queued");

  useEffect(() => {
    if (status === "completed" || status === "failed") {
      router.refresh(); // forces Next.js Server Components inside the layout to refresh with newly established DB state
      return;
    }

    const interval = setInterval(async () => {
      try {
        const current = await pollAction(jobId);
        if (current !== status) {
          setStatus(current);
        }
      } catch (err) {
        setStatus("failed");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, status, pollAction, router]);

  if (status === "completed") return null; // unmount completely to reveal underlying finished server content
  if (status === "failed") return <div className="text-red-500 p-8">Audit process failed or timed out. Please try again.</div>;

  return (
    <div className="flex flex-col items-center justify-center p-24 space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-signal-green"></div>
      <p className="text-muted tracking-widest font-mono text-sm uppercase">
        {status === "queued" ? "Waiting in Queue..." : "Scanning Assets..."}
      </p>
    </div>
  );
}
