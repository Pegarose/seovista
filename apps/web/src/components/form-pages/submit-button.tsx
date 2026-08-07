import type { ReactNode } from "react";

export interface SubmitButtonProps {
  pending: boolean;
  /** Pending label copy (unchanged per tool). */
  pendingLabel: string;
  /** Idle label copy (unchanged per tool). */
  children: ReactNode;
}

export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps): React.ReactElement {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-mineral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spectral focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
