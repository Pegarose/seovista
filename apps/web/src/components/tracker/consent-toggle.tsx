"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAlertConsentAction } from "../../lib/tracker/actions";

export function ConsentToggle({ token, current }: { token: string; current: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await updateAlertConsentAction(token, next);
      if (!result.success) {
        setError(result.error ?? "E-posta uyarı tercihi güncellenemedi.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={current}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.checked)}
          className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
        />
        E-posta uyarıları: {current ? "Açık" : "Kapalı"}
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
