import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DisciplineHero } from "./discipline-hero";

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

type DisciplineLayoutProps = {
  number: string;
  displayName: string;
  accessibleName?: string;
  lede: string;
  capabilities: Capability[];
  supportingNote: string;
  inquireTo: string;
  inquireLabel: string;
  visualCaption: string;
  chapters: Chapter[];
  siblingTo: string;
  siblingLabel: string;
  siblingKicker: string;
};

export function DisciplineLayout(props: DisciplineLayoutProps) {
  return (
    <article className="bg-paper text-ink">
      <DisciplineHero
        number={props.number}
        displayName={props.displayName}
        accessibleName={props.accessibleName}
        lede={props.lede}
        capabilities={props.capabilities.map((c) => c.title)}
        supportingNote={props.supportingNote}
        inquireTo={props.inquireTo}
        inquireLabel={props.inquireLabel}
      />

      {/* Full-bleed blueprint moment */}
      <section className="px-6 md:px-16">
        <div className="relative mx-auto min-h-[540px] w-full max-w-7xl overflow-hidden bg-ink text-paper md:aspect-[21/9]">
          {/* Precision grid */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />

          {/* Corner registration marks */}
          <div aria-hidden="true" className="absolute left-6 top-6 h-4 w-4 border-l border-t border-paper/40" />
          <div aria-hidden="true" className="absolute right-6 top-6 h-4 w-4 border-r border-t border-paper/40" />
          <div aria-hidden="true" className="absolute left-6 bottom-6 h-4 w-4 border-l border-b border-paper/40" />
          <div aria-hidden="true" className="absolute right-6 bottom-6 h-4 w-4 border-r border-b border-paper/40" />

          {/* Top annotation bar */}
          <div className="absolute left-14 right-14 top-6 flex items-center justify-between font-sans text-[10px] uppercase tracking-[0.3em] text-paper/50">
            <span>Discipline / {props.number}</span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              Foundation stage · Sprint 0
            </span>
            <span>{props.displayName} · Blueprint</span>
          </div>

          {/* Center composition */}
          <div className="absolute inset-0 flex items-center">
            <div className="grid w-full grid-cols-12 items-center gap-6 px-14">
              {/* Massive outline numeral */}
              <div className="col-span-5">
                <div
                  className="font-serif font-black leading-[0.78] tracking-tighter text-transparent"
                  style={{
                    WebkitTextStroke: "1px rgb(var(--paper-rgb, 245 243 238) / 0.55)",
                    fontSize: "clamp(9rem, 22vw, 20rem)",
                  }}
                >
                  {props.number}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="h-px w-10 bg-signal" />
                  <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-paper/60">
                    {props.visualCaption}
                  </span>
                </div>
              </div>

              {/* Vertical spine + wordmark */}
              <div className="col-span-2 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <span className="h-16 w-px bg-paper/30" />
                  <span
                    className="font-sans text-[10px] font-semibold uppercase tracking-[0.4em] text-paper/70 [writing-mode:vertical-lr]"
                    style={{ transform: "rotate(180deg)" }}
                  >
                    {props.accessibleName ?? props.displayName}
                  </span>
                  <span className="h-16 w-px bg-paper/30" />
                </div>
              </div>

              {/* Capability blueprint tags */}
              <div className="col-span-5">
                <ul className="flex flex-col gap-3">
                  {props.capabilities.map((c, i) => (
                    <li
                      key={c.title}
                      className="grid grid-cols-[2.5rem_1fr_auto] gap-x-4 border-b border-dashed border-paper/15 pb-3 last:border-0"
                    >
                      <span className="self-baseline font-sans text-[10px] tabular-nums tracking-[0.2em] text-signal">
                        {String(i + 1).padStart(2, "0")}·{props.number}
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="font-serif text-lg leading-tight text-paper md:text-xl">
                          {c.title}
                        </span>
                        <p className="max-w-md font-sans text-sm leading-relaxed text-paper/55">
                          {c.description}
                        </p>
                      </div>
                      <span className="self-baseline font-sans text-[10px] uppercase tracking-[0.2em] text-paper/40">
                        Active
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom annotation bar */}
          <div className="absolute left-14 right-14 bottom-6 flex items-center justify-between font-sans text-[10px] uppercase tracking-[0.3em] text-paper/40">
            <span>SeoVista · Research Lab</span>
            <span>No fabricated data · No performance guarantees</span>
            <span>Sheet {props.number} / 03</span>
          </div>
        </div>
      </section>

      {/* Chapters */}
      <section className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-40">
        <div className="grid grid-cols-1 gap-16 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-3">
            <span className="sticky top-24 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
              Reading
            </span>
          </div>
          <div className="md:col-span-9">
            <div className="flex flex-col divide-y divide-hairline">
              {props.chapters.map((ch, i) => (
                <section
                  key={ch.id}
                  id={ch.id}
                  tabIndex={-1}
                  className="scroll-mt-24 py-16 first:pt-0 last:pb-0 focus:outline-none"
                >
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                    <div className="md:col-span-3">
                      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-signal">
                        {String(i + 1).padStart(2, "0")} — {ch.eyebrow}
                      </span>
                    </div>
                    <div className="md:col-span-9">
                      <h2 className="font-serif text-3xl leading-tight text-ink md:text-5xl">
                        {ch.title}
                      </h2>
                      <div className="mt-6 max-w-2xl font-sans text-lg leading-relaxed text-muted-ink">
                        {ch.body}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Sibling transition */}
      <section className="border-t border-hairline">
        <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-32">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-4">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
                {props.siblingKicker}
              </span>
            </div>
            <div className="md:col-span-8">
              <Link to={props.siblingTo} className="group block">
                <h3 className="font-serif text-4xl leading-tight tracking-tight text-ink transition-colors group-hover:text-signal md:text-6xl">
                  {props.siblingLabel}
                  <span className="inline-block pl-4 transition-transform group-hover:translate-x-2">
                    →
                  </span>
                </h3>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
