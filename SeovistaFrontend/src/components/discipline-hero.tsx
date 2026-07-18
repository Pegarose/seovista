import { Link } from "@tanstack/react-router";

export type DisciplineHeroProps = {
  number: string;
  displayName: string;
  /**
   * Optional accessible name for the h1. When provided it is rendered as
   * screen-reader text so crawlers and assistive tech get the full phrase
   * (e.g. "Generative Engine Optimization") while the visual display keeps
   * the abbreviated wordmark ("GEO.").
   */
  accessibleName?: string;
  lede: string;
  capabilities: string[];
  supportingNote: string;
  inquireTo: string;
  inquireLabel: string;
};

export function DisciplineHero(props: DisciplineHeroProps) {
  const hasAccessibleOverride =
    props.accessibleName && props.accessibleName !== props.displayName;

  return (
    <section className="mx-auto w-full max-w-7xl px-6 pt-24 pb-16 md:px-16 md:pt-40 md:pb-24">
      <div className="flex flex-col items-baseline gap-6 md:flex-row md:gap-12">
        <span
          className="hidden font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink [writing-mode:vertical-lr] md:block"
          style={{ transform: "rotate(180deg)" }}
        >
          Discipline / {props.number}
        </span>
        <h1 className="flex flex-col gap-4 font-serif font-black leading-[0.8] tracking-tighter">
          {hasAccessibleOverride && (
            <span className="font-sans text-xs font-semibold uppercase tracking-[0.3em] text-muted-ink md:text-sm">
              {props.accessibleName}
            </span>
          )}
          <span
            className="block break-words"
            style={{ fontSize: "clamp(3.5rem, 14vw, 12rem)" }}
          >
            {props.displayName}
            <span className="text-signal">.</span>
          </span>
        </h1>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-8 md:mt-24 md:grid-cols-12">
        <div className="md:col-start-5 md:col-span-8">
          <p className="max-w-2xl font-sans text-2xl font-medium leading-tight tracking-tight md:text-4xl">
            {props.lede}
          </p>

          <div className="mt-16 h-px w-full bg-hairline" />

          <div className="mt-8 grid grid-cols-1 gap-12 md:grid-cols-2">
            <div>
              <h2 className="mb-6 font-sans text-[10px] font-bold uppercase italic tracking-[0.2em] text-muted-ink">
                What we work on
              </h2>
              <ul className="space-y-4 font-serif text-xl text-ink">
                {props.capabilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col justify-end">
              <p className="text-sm leading-relaxed text-muted-ink">
                {props.supportingNote}
              </p>
              <div className="mt-8">
                <Link
                  to={props.inquireTo}
                  className="group inline-flex items-center"
                >
                  <span className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] transition-colors group-hover:text-signal">
                    {props.inquireLabel}
                  </span>
                  <svg
                    className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      d="M17 7L7 17M17 7H7M17 7V17"
                      strokeLinecap="square"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
