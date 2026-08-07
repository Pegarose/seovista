import type { ReactNode } from "react";

export interface FormShellProps {
  /** Per-tool page title (unchanged copy). */
  title: string;
  /** Per-tool helper paragraph (unchanged copy). */
  helper?: string;
  /** Eyebrow micro-label; default per the Editorial Lab identity. */
  eyebrow?: string;
  /** Form body (form element with fields + submit). */
  children: ReactNode;
}

export function FormShell({ title, helper, eyebrow = "Seovista / Instruments", children }: FormShellProps): React.ReactElement {
  return (
    <main id="main" className="min-h-screen bg-paper text-ink">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
        <header className="flex flex-col gap-3">
          <span className="flex items-center gap-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
            {eyebrow}
            <span className="h-px w-10 bg-hairline" aria-hidden="true" />
          </span>
          <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">{title}</h1>
          {helper ? (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-ink md:text-base">{helper}</p>
          ) : null}
        </header>
        {children}
      </div>
    </main>
  );
}
