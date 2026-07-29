"use client";

import { useEffect, useRef, useState } from "react";

const PREVIEW_ROWS = [
  { key: "clarity", label: "Clarity", detail: "Subject stated in first paragraph", tag: "observed" },
  { key: "attribution", label: "Attribution", detail: "Primary source cited", tag: "observed" },
  { key: "schema", label: "Structural markup", detail: "Article schema present", tag: "review" },
  { key: "authorship", label: "Authorship", detail: "Byline resolves to identity page", tag: "observed" },
  { key: "crawl", label: "Crawlability", detail: "Rendered HTML matches source", tag: "missing" },
] as const;

const WORKFLOW_STEPS = [
  { id: "analyze", eyebrow: "01 · Analyze", title: "Read the page as both engines do.", body: "Structure, source, and signals — surfaced from the rendered HTML the way a crawler and a generative reader each encounter it.", highlight: ["schema", "crawl"], points: ["Rendered vs. source HTML parity", "Canonical, robots, and indexation posture", "Schema, headings, and semantic anchors"], discipline: { label: "Deep dive: SEO", href: "/seo/#foundations" } },
  { id: "assess", eyebrow: "02 · Assess visibility", title: "Weigh what answer systems weigh.", body: "Clarity, attribution, and technical health mapped against the way generative answer systems decide what to cite and what to skip.", highlight: ["clarity", "attribution"], points: ["Claim → source traceability", "Clarity of the page's core subject", "Signals that make a passage quotable"], discipline: { label: "Deep dive: GEO", href: "/geo/#what-geo-means" } },
  { id: "prioritise", eyebrow: "03 · Prioritise actions", title: "Return an ordered plan, not a score.", body: "Findings become a ranked list of edits with the reasoning attached — grounded in a durable record of expertise, not one-off fixes.", highlight: ["authorship", "crawl", "schema"], points: ["Ranked edits with explicit rationale", "Effort weighed against visibility impact", "A trail of decisions, not a black box"], discipline: { label: "Deep dive: Authority", href: "/digital-authority/#earned-not-bought" } },
] as const;

export function WorkflowScene(): React.ReactElement {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let raf = 0;
    let ticking = false;
    let viewportH = window.innerHeight;
    let resizeTimer: number | undefined;
    const pick = () => {
      raf = 0;
      ticking = false;
      const anchor = viewportH / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      stepRefs.current.forEach((element, index) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - anchor);
        if (distance < bestDist) { bestDist = distance; bestIdx = index; }
      });
      setActive((previous) => previous === bestIdx ? previous : bestIdx);
    };
    const schedule = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(pick);
    };
    pick();
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        viewportH = window.innerHeight;
        schedule();
      }, 120);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <section aria-labelledby="workflow-title" className="border-b border-hairline">
      <div className="mx-auto max-w-6xl px-6 pt-20 md:pt-24"><p className="font-mono text-xs uppercase tracking-widest text-muted-ink">Working with SeoVista</p><h2 id="workflow-title" className="mt-2 font-serif text-3xl text-ink md:text-4xl">One workflow. Three deliberate moves.</h2><p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-ink">Not three separate services — one editorial method that reads a page, weighs its visibility, and returns an ordered plan.</p></div>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-16 md:pb-24 md:pt-10">
        <div>{WORKFLOW_STEPS.map((step, index) => { const isActive = active === index; return <div key={step.id} ref={(element) => { stepRefs.current[index] = element; }} role="group" tabIndex={0} aria-labelledby={`workflow-step-${step.id}-title`} aria-current={isActive ? "step" : undefined} className="relative flex flex-col justify-center rounded-md border-t border-hairline py-10 pl-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-4 focus-visible:ring-offset-paper first:border-t-0 first:pt-0 md:min-h-[55vh] md:py-14 md:pl-6"><span aria-hidden="true" className={`absolute bottom-10 left-0 top-10 w-0.5 rounded-full transition-colors md:bottom-14 md:top-14 ${isActive ? "bg-signal" : "bg-transparent"}`} /><p className={`font-mono text-xs uppercase tracking-widest transition-colors ${isActive ? "font-semibold text-ink" : "text-muted-ink"}`}>{step.eyebrow}{isActive && <span className="sr-only"> (current step)</span>}</p><h3 id={`workflow-step-${step.id}-title`} className="mt-3 font-serif text-2xl text-ink md:text-3xl">{step.title}</h3><p className="mt-4 max-w-md text-base leading-relaxed text-muted-ink">{step.body}</p><ul className="mt-6 space-y-2">{step.points.map((point) => <li key={point} className={`grid grid-cols-[auto_1fr] items-baseline gap-3 font-mono text-[11px] uppercase tracking-widest ${isActive ? "text-ink" : "text-muted-ink"}`}><span aria-hidden="true" className="h-1 w-1 translate-y-[-2px] rounded-full bg-signal" /><span>{point}</span></li>)}</ul><div className="mt-6"><a href={step.discipline.href} className="inline-flex items-center gap-2 border-b border-hairline pb-0.5 font-mono text-xs uppercase tracking-widest text-ink transition-colors hover:border-ink">{step.discipline.label}<span aria-hidden="true">→</span></a></div><div className="mt-8 md:hidden"><WorkflowPreview highlight={step.highlight} stepLabel={step.eyebrow} /></div></div>; })}</div>
        <aside className="hidden md:block" aria-label="Workflow preview"><div className="sticky top-24"><div className="relative w-full"><div className="absolute -top-8 right-0 flex items-center justify-end gap-2" role="tablist" aria-label={`Workflow step ${active + 1} of ${WORKFLOW_STEPS.length}`}>{WORKFLOW_STEPS.map((step, index) => <button key={step.id} type="button" role="tab" aria-selected={active === index} aria-label={`Go to ${step.eyebrow}`} onClick={() => { const element = stepRefs.current[index]; if (element) { element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); element.focus({ preventScroll: true }); } }} className="inline-flex h-6 w-8 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-2 focus-visible:ring-offset-paper"><span aria-hidden="true" className={`block h-1 w-6 rounded-full ${active === index ? "bg-ink" : "bg-muted-ink/40"}`} /></button>)}</div><WorkflowPreview highlight={WORKFLOW_STEPS[active]?.highlight ?? WORKFLOW_STEPS[0].highlight} stepLabel={WORKFLOW_STEPS[active]?.eyebrow ?? WORKFLOW_STEPS[0].eyebrow} /></div></div></aside>
      </div>
    </section>
  );
}

function WorkflowPreview({ highlight, stepLabel }: { highlight?: readonly string[]; stepLabel?: string }): React.ReactElement {
  const highlightSet = highlight ? new Set(highlight) : null;
  return <div><div className="rounded-lg border border-hairline bg-card" role="region" aria-label="Illustrative preview of workflow output"><div className="flex items-center justify-between border-b border-hairline px-5 py-3"><div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" /><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-ink">Illustrative preview</span></div><span className="font-mono text-[10px] uppercase tracking-widest text-muted-ink">example.com/page</span></div>{stepLabel && <p aria-live="polite" aria-atomic="true" className="sr-only">Showing preview for {stepLabel}</p>}<ul className="space-y-4 px-5 py-5">{PREVIEW_ROWS.map((row) => { const isActive = !highlightSet || highlightSet.has(row.key); return <li key={row.label} aria-current={highlightSet && isActive ? "true" : undefined} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-hairline pt-4 transition-opacity duration-300 first:border-t-0 first:pt-0 ${isActive ? "opacity-100" : "opacity-90"}`}>                <div className="font-mono text-[10px] uppercase tracking-widest text-ink">
                  {row.label}
                </div>
                <div className="text-sm text-ink">{row.detail}</div>
                <span
                  className={
                    "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest " +
                    (row.tag === "observed"
                      ? "border-signal/30 bg-signal/15 text-ink"
                      : row.tag === "review"
                        ? "border-hairline bg-paper text-ink"
                        : "border-hairline bg-mineral text-ink")
                  }
                ><span className="sr-only">Status: </span>{row.tag}</span></li>; })}</ul></div><p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-ink">Static illustration of the intended workflow. No audit runs.</p></div>;
}
