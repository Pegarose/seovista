"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deactivateTrackerTargetAction } from "../../lib/tracker/actions";

export function DeactivateButton({
  token,
  targetId,
  active,
}: {
  token: string;
  targetId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!active) return null;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await deactivateTrackerTargetAction(token, targetId);
      if (!result.success) {
        setError(result.error ?? "Hedef kaldırılamadı.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
      >
        {isPending ? "Kaldırılıyor..." : "Kaldır"}
      </button>
      {error && (
        <p className="text-xs text-red-600" role="alert">{error}</p>
      )}
    </div>
  );
}
