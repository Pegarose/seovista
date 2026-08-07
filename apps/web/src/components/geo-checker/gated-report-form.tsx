"use client";

import { useActionState } from "react";
import { unlockDetailedReport } from "@/lib/geo-checker/actions";
import { useRouter } from "next/navigation";

export function GatedReportForm({ leadId, jobId }: { leadId: string; jobId: string }) {
  const router = useRouter();
  
  const [state, formAction, pending] = useActionState(
    async (prev: any, formData: FormData) => {
      const result = await unlockDetailedReport(prev, formData);
      if (result.success) {
        router.refresh();
      }
      return result;
    },
    null
  );

  return (
    <div className="bg-mineral border border-hairline rounded-xl p-8 max-w-2xl mx-auto my-8 mt-12">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-ink mb-2">Unlock Full Detailed Report</h3>
        <p className="text-muted-ink">
          Enter your email to uncover our full keyword mapping, AI response scores, and actionable recommendations.
        </p>
      </div>
      
      <form action={formAction} className="space-y-4 max-w-md mx-auto">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="jobId" value={jobId} />
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
            Work Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full rounded-lg border border-hairline bg-paper px-4 py-3 text-ink placeholder:text-muted-ink/60 focus:border-spectral focus:outline-none focus:ring-2 focus:ring-spectral/20 transition-colors"
            placeholder="you@company.com"
          />
        </div>

        <div className="flex items-start gap-3 mt-4">
          <input 
            type="checkbox" 
            id="consent" 
            name="consent" 
            value="true"
            className="mt-1 h-4 w-4 text-spectral rounded border-hairline focus:ring-spectral"
          />
          <label htmlFor="consent" className="text-sm text-ink">
            I agree to receive occasional updates about AI search strategies and SeoVista product news.
          </label>
        </div>

        {state?.error && (
          <div className="text-ember text-sm p-3 bg-mineral rounded-lg">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full mt-4 bg-ink text-paper font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 hover:bg-mineral"
        >
          {pending ? (
            <>
              <div className="w-5 h-5 border-2 border-paper/40 border-t-paper rounded-full animate-spin"></div>
              Unlocking...
            </>
          ) : (
            'Unlock Report'
          )}
        </button>
      </form>
    </div>
  );
}

