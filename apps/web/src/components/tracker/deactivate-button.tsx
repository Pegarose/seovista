"use client";

import { useTransition } from "react";
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

  if (!active) return null;

  function handleClick() {
    startTransition(async () => {
      try {
        await deactivateTrackerTargetAction(token, targetId);
        router.refresh();
      } catch {
        // Error is logged in the action; the button resets on next render
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {isPending ? "Kaldırılıyor..." : "Kaldır"}
    </button>
  );
}
