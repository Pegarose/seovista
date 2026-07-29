import type { ReactNode } from "react";

export type Chapter = {
  id: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
};

export type Capability = {
  title: string;
  description: string;
};

type DisciplineHeroProps = {
  number: string;
  displayName: string;
  accessibleName?: string;
  lede: string;
  capabilities: string[];
  supportingNote: string;
  inquireTo: string;
  inquireLabel: string;
};

export function DisciplineHero(props: DisciplineHeroProps): React.ReactElement {
  const hasAccessibleOverride = props.accessibleName && props.accessibleName !== props.displayName;
  return (
    <section className="mx-auto w-full max-w-7xl px-6 pb-16 pt-24 md:px-16 md:pb-24 md:pt-40">
      <div className="flex flex-col items-baseline gap-6 md:flex-row md:gap-12">
        <span className="hidden font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink [writing-mode:vertical-lr] md:block" style={{ transform: "rotate(180deg)" }}>
          Discipline / {props.number}
        </span>
        <div className="flex flex-col gap-4 font-serif font-black leading-[0.8] tracking-tighter">
          {hasAccessibleOverride ? (
            <>
              <h1 className="font-sans text-xs font-semibold uppercase tracking-[0.3em] text-muted-ink md:text-sm">
                {props.accessibleName}
              </h1>
              <span aria-hidden="true" className="block break-words" style={{ fontSize: "clamp(3.5rem, 14vw, 12rem)" }}>
                {props.displayName}<span className="text-signal">.</span>
              </span>
            </>
          ) : (
            <h1 className="block break-words" style={{ fontSize: "clamp(3.5rem, 14vw, 12rem)" }}>
              {props.displayName}<span className="text-signal">.</span>
            </h1>
          )}
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-8 md:mt-24 md:grid-cols-12">
        <div className="md:col-span-8 md:col-start-5">
          <p className="max-w-2xl font-sans text-2xl font-medium leading-tight tracking-tight md:text-4xl">{props.lede}</p>
          <div className="mt-16 h-px w-full bg-hairline" />
          <div className="mt-8 grid grid-cols-1 gap-12 md:grid-cols-2">
            <div>
              <h2 className="mb-6 font-sans text-[10px] font-bold uppercase italic tracking-[0.2em] text-muted-ink">What we work on</h2>
              <ul className="space-y-4 font-serif text-xl text-ink">{props.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
            </div>
            <div className="flex flex-col justify-end">
              <p className="text-sm leading-relaxed text-muted-ink">{props.supportingNote}</p>
              <div className="mt-8">
                <a href={props.inquireTo} className="group inline-flex items-center">
                  <span className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] transition-colors group-hover:text-signal">
                    {props.inquireLabel}
                  </span>
                  <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d="M17 7L7 17M17 7H7M17 7V17" strokeLinecap="square" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type DisciplineLayoutProps = Omit<DisciplineHeroProps, "capabilities"> & {
  visualCaption: string;
  chapters: Chapter[];
  capabilities: Capability[];
  siblingTo: string;
  siblingLabel: string;
  siblingKicker: string;
};

export function DisciplineLayout(props: DisciplineLayoutProps): React.ReactElement {
  return (
    <article className="bg-paper text-ink">
      <DisciplineHero {...props} capabilities={props.capabilities.map((capability) => capability.title)} />
      <section className="px-6 md:px-16">
        <div className="relative mx-auto min-h-[540px] w-full max-w-7xl overflow-hidden bg-ink text-paper md:aspect-[21/9]">
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
          <div aria-hidden="true" className="absolute left-6 top-6 h-4 w-4 border-l border-t border-paper/80" />
          <div aria-hidden="true" className="absolute right-6 top-6 h-4 w-4 border-r border-t border-paper/80" />
          <div aria-hidden="true" className="absolute bottom-6 left-6 h-4 w-4 border-b border-l border-paper/80" />
          <div aria-hidden="true" className="absolute bottom-6 right-6 h-4 w-4 border-b border-r border-paper/80" />
          <div className="absolute left-14 right-14 top-6 flex items-center justify-between font-sans text-[10px] uppercase tracking-[0.3em] text-paper/80">
            <span>Discipline / {props.number}</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-signal" />Foundation stage · Sprint 0</span><span>{props.displayName} · Blueprint</span>
          </div>
          <div className="absolute inset-0 flex items-center">
            <div className="grid w-full grid-cols-12 items-center gap-6 px-14">
              <div className="col-span-5">
                <div className="font-serif font-black leading-[0.78] tracking-tighter text-transparent" style={{ WebkitTextStroke: "1px rgb(245 243 238 / 0.8)", fontSize: "clamp(9rem, 22vw, 20rem)" }}>{props.number}</div>
                <div className="mt-4 flex items-center gap-3"><span className="h-px w-10 bg-signal" /><span className="font-sans text-[10px] uppercase tracking-[0.3em] text-paper/80">{props.visualCaption}</span></div>
              </div>
              <div className="col-span-2 flex items-center justify-center"><div className="flex flex-col items-center gap-4"><span className="h-16 w-px bg-paper/40" /><span className="font-sans text-[10px] font-semibold uppercase tracking-[0.4em] text-paper/90 [writing-mode:vertical-lr]" style={{ transform: "rotate(180deg)" }}>{props.accessibleName ?? props.displayName}</span><span className="h-16 w-px bg-paper/40" /></div></div>
              <div className="col-span-5">
                <ul className="flex flex-col gap-3">{props.capabilities.map((capability, i) => <li key={capability.title} className="grid grid-cols-[2.5rem_1fr_auto] gap-x-4 border-b border-dashed border-paper/20 pb-3 last:border-0"><span className="self-baseline font-sans text-[10px] tabular-nums tracking-[0.2em] text-signal">{String(i + 1).padStart(2, "0")}·{props.number}</span><div className="flex flex-col gap-1"><span className="font-serif text-lg leading-tight text-paper md:text-xl">{capability.title}</span><p className="max-w-md font-sans text-sm leading-relaxed text-paper/80">{capability.description}</p></div><span className="self-baseline font-sans text-[10px] uppercase tracking-[0.2em] text-paper/70">Active</span></li>)}</ul>
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 left-14 right-14 flex items-center justify-between font-sans text-[10px] uppercase tracking-[0.3em] text-paper/80"><span>SeoVista · Research Lab</span><span>No fabricated data · No performance guarantees</span><span>Sheet {props.number} / 03</span></div>
        </div>
      </section>
      <section className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-40">
        <div className="grid grid-cols-1 gap-16 md:grid-cols-12 md:gap-8"><div className="md:col-span-3"><span className="sticky top-24 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">Reading</span></div><div className="md:col-span-9"><div className="flex flex-col divide-y divide-hairline">{props.chapters.map((chapter, i) => <section key={chapter.id} id={chapter.id} tabIndex={-1} className="scroll-mt-24 py-16 first:pt-0 last:pb-0 focus:outline-none"><div className="grid grid-cols-1 gap-8 md:grid-cols-12"><div className="md:col-span-3"><span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-signal-text">{String(i + 1).padStart(2, "0")} — {chapter.eyebrow}</span></div><div className="md:col-span-9"><h2 className="font-serif text-3xl leading-tight text-ink md:text-5xl">{chapter.title}</h2><div className="mt-6 max-w-2xl font-sans text-lg leading-relaxed text-muted-ink">{chapter.body}</div></div></div></section>)}</div></div></div>
      </section>
      <section className="border-t border-hairline"><div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-32"><div className="grid grid-cols-1 gap-8 md:grid-cols-12"><div className="md:col-span-4"><span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">{props.siblingKicker}</span></div><div className="md:col-span-8"><a href={props.siblingTo} className="group block"><h3 className="font-serif text-4xl leading-tight tracking-tight text-ink transition-colors group-hover:text-signal md:text-6xl">{props.siblingLabel}<span className="inline-block pl-4 transition-transform group-hover:translate-x-2" aria-hidden="true">→</span></h3></a></div></div></div></section>
    </article>
  );
}
