"use client";

import { useActionState } from "react";

export function GatedReportForm({ leadId, actionBase }: { leadId: string, actionBase: (prev: any, formData: FormData) => Promise<{ success?: boolean; error?: string }> }) {
  const [state, formAction, pending] = useActionState(actionBase, { success: false });

  if (state.success) {
    return (
      <div className="p-6 border border-signal-green bg-signal-green/10 rounded my-4">
        <h3 className="font-bold text-lg mb-2">Unlocked PDF Download</h3>
        <a href={`/tools/geo-readiness-checker/download/${leadId}`} className="underline text-spectral-blue">Download Detailed Report.pdf</a>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 my-8 p-6 bg-mineral rounded border border-border-light">
      <h3 className="font-semibold text-graphite mb-2">Get the Detailed Breakdown</h3>
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
      <div>
        <label className="block text-sm mb-1">Work Email</label>
        <input name="email" type="email" required className="w-full border p-2 rounded" />
      </div>
      <div className="flex items-center space-x-2">
        <input name="consent" type="checkbox" id="marketing_consent" value="true" />
        <label htmlFor="marketing_consent" className="text-sm text-muted">I agree to receive communications regarding visibility strategies.</label>
      </div>
      <input type="hidden" name="leadId" value={leadId} />
      <button type="submit" disabled={pending} className="bg-spectral-blue text-paper px-4 py-2 font-medium rounded disabled:opacity-50">
        Unlock Detailed Report
      </button>
    </form>
  )
}
