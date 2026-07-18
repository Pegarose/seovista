## Task 4: Output Gated Report Form

**Files:**
- Create: `apps/web/src/components/geo-checker/gated-report-form.tsx`
- Modify: `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx`

**Interfaces:**
- Consumes: A new `unlockDetailedReport` action wrapping `updateLeadEmail`.
- Produces: The fully compliant Lead Generation form displaying un-gated simple metrics, then asking for an email + unchecked consent flag.

- [ ] **Step 1: Write the actionable component**

```tsx
// apps/web/src/components/geo-checker/gated-report-form.tsx
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
```

- [ ] **Step 2: Add wrapper action to `actions.ts`**

```typescript
// append inside apps/web/src/lib/geo-checker/actions.ts

export async function unlockDetailedReport(prev: any, formData: FormData) {
  const email = formData.get("email") as string;
  const consent = formData.get("consent") === "true";
  const leadId = formData.get("leadId") as string;

  if (!email || !email.includes("@")) return { error: "Please provide a valid work email." };

  try {
    const db = getAdminDb();
    const repo = createAuditRepository(db);
    await repo.updateLeadEmail(leadId, email, consent);
    return { success: true };
  } catch (err) {
    return { error: "Database error assigning lead." };
  }
}
```

- [ ] **Step 3: Update `page.tsx` with Lead ID passing**

```tsx
// apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx
// (Replace the Status === completed block)

// import { GatedReportForm } from "@/src/components/geo-checker/gated-report-form";
// import { unlockDetailedReport } from "@/src/lib/geo-checker/actions";

// ... Inside layout:
      {status === "completed" ? (
         <div className="bg-paper p-8 rounded shadow-lg text-ink max-w-2xl mx-auto w-full">
           <h1 className="text-3xl font-display font-semibold mb-4">Audit Complete: Summary</h1>
           <div className="grid grid-cols-2 gap-4 my-8">
             <div className="bg-mineral p-4 rounded text-center">
                 <div className="text-sm text-muted uppercase tracking-wider mb-2">Access</div>
                 <div className="text-2xl font-bold text-signal-green">Pass</div>
             </div>
             <div className="bg-mineral p-4 rounded text-center">
                 <div className="text-sm text-muted uppercase tracking-wider mb-2">Understanding</div>
                 <div className="text-2xl font-bold text-spectral-blue">78/100</div>
             </div>
           </div>
           <GatedReportForm leadId={res.rows[0].lead_id} actionBase={unlockDetailedReport} />
         </div>
      ) : ( ... )}
```
