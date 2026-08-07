import type { ReactNode } from "react";

export interface FormFieldProps {
  /** Control id — must equal the input/select/textarea id. */
  id: string;
  /** Visible label copy (unchanged per tool). */
  label: string;
  /** Single field-error string ("role=alert"); omitted when undefined. */
  error?: string;
  /** The control (and optional hint text). */
  children: ReactNode;
}

export function FormField({ id, label, error, children }: FormFieldProps): React.ReactElement {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <div className="mt-1">{children}</div>
      {error ? <p role="alert" className="mt-2 text-sm text-ember">{error}</p> : null}
    </div>
  );
}
