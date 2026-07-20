"use client";

import { useActionState } from "react";
import { unlockDetailedReport } from "@/lib/geo-checker/actions";
import { useRouter } from "next/navigation";

export function GatedReportForm({ leadId }: { leadId: string }) {
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
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-8 max-w-2xl mx-auto my-8 mt-12">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-indigo-900 mb-2">Unlock Full Detailed Report</h3>
        <p className="text-indigo-700">
          Enter your email to uncover our full keyword mapping, AI response scores, and actionable recommendations.
        </p>
      </div>
      
      <form action={formAction} className="space-y-4 max-w-md mx-auto">
        <input type="hidden" name="leadId" value={leadId} />
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-indigo-900 mb-1">
            Work Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full px-4 py-3 rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
            placeholder="you@company.com"
          />
        </div>

        <div className="flex items-start gap-3 mt-4">
          <input 
            type="checkbox" 
            id="consent" 
            name="consent" 
            value="true"
            className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
          />
          <label htmlFor="consent" className="text-sm text-indigo-800">
            I agree to receive occasional updates about AI search strategies and SeoVista product news.
          </label>
        </div>

        {state?.error && (
          <div className="text-red-600 text-sm p-3 bg-red-50 rounded-lg">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {pending ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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

