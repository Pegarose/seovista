"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkJobStatusAction } from "@/lib/geo-checker/actions";

export function AuditPoller({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("queued");
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      const result = await checkJobStatusAction(jobId);
      
      if (result.success && result.data) {
        setStatus(result.data.status);
        
        if (result.data.status === "completed") {
          router.refresh(); // Tells Next.js to re-render the server component
        } else if (result.data.status === "failed") {
          // You might want to handle failure state here, maybe redirect or show error UI.
          // For now, we rely on the generic state handling or server response maybe?
          // Next.js refresh can be nice here too. 
          router.refresh();
        } else {
          timeoutId = setTimeout(poll, 2000); // Poll again in 2 seconds
        }
      } else {
        timeoutId = setTimeout(poll, 2000); // Retry on error as well
      }
    };

    poll();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [jobId, router]);

  return (
    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow-sm border border-slate-200">
      <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
      <h3 className="text-xl font-medium text-slate-800 mb-2">
        {status === 'queued' ? 'Audit in queue...' : 'Running audit...'}
      </h3>
      <p className="text-slate-500 text-center max-w-sm">
        We are scanning your domain and analyzing AI Search visibility. This typically takes a moment.
      </p>
    </div>
  );
}
