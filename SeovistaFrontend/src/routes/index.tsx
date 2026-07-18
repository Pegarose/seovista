import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CtaLink } from "@/components/cta";
import { MethodologyStep, StatusBadge } from "@/components/editorial";
import { canonicalFor, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-config";

const TITLE = `${SITE_NAME} — Editorial intelligence for search visibility`;
const DESC =
  "SeoVista studies how brands earn visibility across search engines and generative answer systems through clarity, technical health, credible sources, and topical authority.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/") },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/") }],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <>
      <section
        className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center overflow-hidden border-b border-hairline px-4 py-8 sm:px-6 md:px-8"
      >
        {/* Paper grain texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-multiply">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <filter id="hero-noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#hero-noise)" />
          </svg>
        </div>

        {/* Slow scanning line */}
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          <div className="hero-scan-line absolute left-0 top-0 h-px w-full bg-signal/25" />
        </div>

        {/* Warm editorial glow behind headline */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-[420px] w-[92vw] max-w-[860px] -translate-x-1/2 -translate-y-[55%] rounded-full blur-[80px] md:h-[560px] md:blur-[100px]"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.90 0.075 55 / 0.85) 0%, oklch(0.93 0.055 60 / 0.55) 35%, oklch(0.95 0.035 65 / 0.25) 60%, transparent 78%)",
          }}
          aria-hidden="true"
        />

        {/* Square grid background — radial-masked */}
        <div
          className="pointer-events-none absolute inset-0 z-[2]"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(0.25 0.02 250 / 0.09) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.25 0.02 250 / 0.09) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(ellipse at center, black 0%, black 40%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 0%, black 40%, transparent 78%)",
          }}
        />

        {/* Corner brackets — full viewport frame */}
        <span aria-hidden="true" className="absolute left-6 top-24 h-8 w-8 border-l border-t border-ink/20 md:left-10 md:h-12 md:w-12" />
        <span aria-hidden="true" className="absolute right-6 top-24 h-8 w-8 border-r border-t border-ink/20 md:right-10 md:h-12 md:w-12" />
        <span aria-hidden="true" className="absolute bottom-8 left-6 h-8 w-8 border-b border-l border-ink/20 md:bottom-12 md:left-10 md:h-12 md:w-12" />
        <span aria-hidden="true" className="absolute bottom-8 right-6 h-8 w-8 border-b border-r border-ink/20 md:bottom-12 md:right-10 md:h-12 md:w-12" />

        {/* Bottom frame: short lines with centered lab label, aligned to bracket base */}
        <div className="absolute bottom-8 left-0 right-0 flex items-end justify-center gap-3 md:bottom-12">
          <div className="h-px w-10 bg-ink/20 md:w-16" aria-hidden="true" />
          <span className="shrink-0 translate-y-[2px] bg-paper px-2 font-mono text-[10px] uppercase leading-none tracking-[0.25em] text-muted-ink">
            SeoVista Research Lab
          </span>
          <div className="h-px w-10 bg-ink/20 md:w-16" aria-hidden="true" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-4xl -translate-y-[1.75rem] text-center md:max-w-5xl lg:max-w-6xl">
          <div className="hero-rise inline-flex items-center gap-2 border border-hairline bg-mineral px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-ink">
              Foundation Stage · Sprint 0
            </span>
          </div>

          <h1 className="hero-rise mt-6 font-serif text-5xl font-light leading-[1.05] tracking-tight text-ink sm:text-6xl md:mt-8 md:text-7xl lg:text-8xl" style={{ animationDelay: "80ms" }}>
            Visibility is earned,
            <br />
            <span className="font-normal italic">not engineered.</span>
          </h1>

          <p className="hero-rise mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-ink sm:text-lg md:mt-8 md:max-w-3xl md:text-xl lg:text-2xl" style={{ animationDelay: "160ms" }}>
            {SITE_DESCRIPTION} We publish structured thinking on how clarity,
            technical health, credible sourcing, and topical authority shape
            what search engines and generative answer systems choose to surface.
          </p>

          <div className="hero-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row md:mt-10" style={{ animationDelay: "240ms" }}>
            <CtaLink to="/geo/" variant="primary">Learn about GEO</CtaLink>
            <CtaLink to="/tools/geo-readiness-checker/" variant="secondary">
              See the foundation tool
            </CtaLink>
          </div>

        </div>
      </section>

      {/* Transition band — soft continuation of the hero glow, hosts the overlapping product panel */}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[220px]"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 60% 100% at 50% 0%, oklch(0.93 0.055 60 / 0.28) 0%, oklch(0.95 0.035 65 / 0.12) 45%, transparent 75%)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-[220px] h-px bg-hairline" aria-hidden="true" />

        {/* Product panel — overlaps hero */}
        <section
          aria-labelledby="how-it-works-title"
          className="relative z-10 mx-auto -mt-10 max-w-6xl px-4 sm:px-6 md:-mt-20 md:px-8"
        >
          <div
            className="relative overflow-hidden rounded-xl border border-hairline bg-card"
            style={{ boxShadow: "0 1px 0 0 rgba(0,0,0,0.02), 0 24px 60px -30px rgba(0,0,0,0.18)" }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-signal/40" aria-hidden="true" />

            <div className="grid gap-0 md:grid-cols-2">
              {/* Left — method flow */}
              <div className="border-b border-hairline p-8 md:border-b-0 md:border-r md:p-10">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-ink">
                  How SeoVista works
                </p>
                <h2 id="how-it-works-title" className="mt-2 font-serif text-3xl text-ink">
                  A method, not a magic box.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-ink">
                  Three deliberate stages describe how the practice reads a page,
                  weighs its visibility, and turns findings into ordered work.
                </p>

                <ol className="mt-8 space-y-6">
                  {[
                    {
                      n: 1,
                      title: "Scan",
                      body: "Read the page the way both a crawler and a generative reader would: source, structure, signals.",
                    },
                    {
                      n: 2,
                      title: "Assess visibility",
                      body: "Weigh clarity, attribution, and technical health against how answer systems decide what to cite.",
                    },
                    {
                      n: 3,
                      title: "Prioritised actions",
                      body: "Return an ordered list of edits with the reasoning attached — not a score, a plan.",
                    },
                  ].map((step) => (
                    <li key={step.n} className="grid grid-cols-[auto_1fr] gap-4">
                      <div className="font-mono text-xs text-muted-ink">
                        {String(step.n).padStart(2, "0")}
                      </div>
                      <div>
                        <h3 className="font-serif text-lg text-ink">{step.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-ink">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Right — illustrative brief card */}
              <div className="relative bg-mineral/40 p-8 md:p-10">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.05]"
                  aria-hidden="true"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, oklch(0.25 0.02 250 / 1) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.25 0.02 250 / 1) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                  }}
                />
                <div className="relative rounded-lg border border-hairline bg-card">
                  <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-ink">
                        Illustrative preview
                      </span>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-ink">
                      example.com/page
                    </span>
                  </div>

                  <div className="space-y-4 px-5 py-5">
                    {[
                      { label: "Clarity", detail: "Subject stated in first paragraph", tag: "observed" },
                      { label: "Attribution", detail: "Primary source cited", tag: "observed" },
                      { label: "Structural markup", detail: "Article schema present", tag: "review" },
                      { label: "Authorship", detail: "Byline resolves to identity page", tag: "observed" },
                      { label: "Crawlability", detail: "Rendered HTML matches source", tag: "missing" },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-hairline pt-4 first:border-t-0 first:pt-0"
                      >
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-ink">
                          {row.label}
                        </div>
                        <div className="text-sm text-ink">{row.detail}</div>
                        <span
                          className={
                            "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest " +
                            (row.tag === "observed"
                              ? "border-signal/40 bg-signal/10 text-ink"
                              : row.tag === "review"
                                ? "border-hairline bg-paper text-muted-ink"
                                : "border-hairline bg-mineral text-muted-ink")
                          }
                        >
                          {row.tag}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="relative mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-ink">
                  Static illustration of the intended workflow. No audit runs.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Compact trust strip — only verifiable, non-fabricated statements */}
        <div className="mt-16 border-y border-hairline bg-mineral/40 md:mt-24">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-4 text-center">
            {[
              "Foundation stage · Sprint 0",
              "Editorial research lab",
              "Public methodology",
              "No tracking on this page",
            ].map((item, i) => (
              <span key={item} className="flex items-center gap-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-ink">
                {i > 0 && <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-hairline md:inline-block" />}
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-ink">The problem</p>
              <h2 className="mt-2 font-serif text-3xl text-ink">
                Two audiences, one page.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-relaxed text-muted-ink">
              Brands now have to be understandable to both traditional search
              systems and generative answer systems. The pages that succeed are
              not the loudest — they are the ones whose structure, evidence, and
              provenance are unambiguous to a machine that must decide what to
              cite.
            </p>
          </div>
        </div>
      </section>

      <WorkflowScene />


      <section className="border-b border-hairline bg-mineral/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-ink">Methodology</p>
          <h2 className="mt-2 font-serif text-3xl text-ink">What we look for.</h2>
          <ol className="mt-8">
            <MethodologyStep index={1} title="Clear information architecture">
              A page's purpose and place in the site should be obvious within
              seconds — to a reader and to a crawler.
            </MethodologyStep>
            <MethodologyStep index={2} title="Useful, attributable content">
              Statements should be traceable to a source. Opinion should be
              clearly marked as such.
            </MethodologyStep>
            <MethodologyStep index={3} title="Technical crawlability and indexation">
              Rendering, status codes, canonicals, and structured data must
              agree with what a reader sees.
            </MethodologyStep>
            <MethodologyStep index={4} title="Credible sourcing">
              Citations to primary material outperform citations to summaries
              of summaries.
            </MethodologyStep>
            <MethodologyStep index={5} title="Consistent topical expertise">
              Authority accrues to sites that keep publishing on a subject over
              time, not to one-off pages.
            </MethodologyStep>
          </ol>
        </div>
      </section>

      <section className="border-b border-hairline">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
          <div className="rounded-lg border border-hairline bg-card p-8">
            <StatusBadge>Non-operational preview</StatusBadge>
            <h2 className="mt-4 font-serif text-2xl text-ink">GEO Readiness Checker</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-ink">
              A future tool for assessing a page's readiness to be understood
              and cited by generative answer systems. There is no submission
              flow, no score, and no report in the foundation release.
            </p>
            <div className="mt-6">
              <CtaLink to="/tools/geo-readiness-checker/" variant="secondary">
                Read the tool brief
              </CtaLink>
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-card p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-ink">Insights</p>
            <h2 className="mt-2 font-serif text-2xl text-ink">Editorial research</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-ink">
              We publish articles only when the underlying research is ready.
              No filler and no fabricated benchmarks.
            </p>
            <div className="mt-6">
              <CtaLink to="/insights/" variant="secondary">Browse Insights</CtaLink>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="font-serif text-3xl text-ink">Work with us as we build.</h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-ink">
            SeoVista is an editorial lab, not a growth-hacking studio. If that
            frames the kind of collaboration you're looking for, reach out.
          </p>
          <div className="mt-8">
            <CtaLink to="/contact/" variant="primary">Contact SeoVista</CtaLink>
          </div>
        </div>
      </section>
    </>
  );
}

const PREVIEW_ROWS = [
  { key: "clarity", label: "Clarity", detail: "Subject stated in first paragraph", tag: "observed" as const },
  { key: "attribution", label: "Attribution", detail: "Primary source cited", tag: "observed" as const },
  { key: "schema", label: "Structural markup", detail: "Article schema present", tag: "review" as const },
  { key: "authorship", label: "Authorship", detail: "Byline resolves to identity page", tag: "observed" as const },
  { key: "crawl", label: "Crawlability", detail: "Rendered HTML matches source", tag: "missing" as const },
];

const WORKFLOW_STEPS = [
  {
    id: "analyze",
    eyebrow: "01 · Analyze",
    title: "Read the page as both engines do.",
    body: "Structure, source, and signals — surfaced from the rendered HTML the way a crawler and a generative reader each encounter it.",
    highlight: ["schema", "crawl"],
    points: [
      "Rendered vs. source HTML parity",
      "Canonical, robots, and indexation posture",
      "Schema, headings, and semantic anchors",
    ],
    discipline: { label: "Deep dive: SEO", to: "/seo/" as const, hash: "foundations" },
  },
  {
    id: "assess",
    eyebrow: "02 · Assess visibility",
    title: "Weigh what answer systems weigh.",
    body: "Clarity, attribution, and technical health mapped against the way generative answer systems decide what to cite and what to skip.",
    highlight: ["clarity", "attribution"],
    points: [
      "Claim → source traceability",
      "Clarity of the page's core subject",
      "Signals that make a passage quotable",
    ],
    discipline: { label: "Deep dive: GEO", to: "/geo/" as const, hash: "what-geo-means" },
  },
  {
    id: "prioritise",
    eyebrow: "03 · Prioritise actions",
    title: "Return an ordered plan, not a score.",
    body: "Findings become a ranked list of edits with the reasoning attached — grounded in a durable record of expertise, not one-off fixes.",
    highlight: ["authorship", "crawl", "schema"],
    points: [
      "Ranked edits with explicit rationale",
      "Effort weighed against visibility impact",
      "A trail of decisions, not a black box",
    ],
    discipline: { label: "Deep dive: Authority", to: "/digital-authority/" as const, hash: "earned-not-bought" },
  },
];


function WorkflowScene() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);
  const sceneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let ticking = false;
    let inView = true;
    let viewportH = window.innerHeight;
    let resizeTimer: number | undefined;

    const pick = () => {
      raf = 0;
      ticking = false;
      const anchor = viewportH / 2;
      const steps = stepRefs.current;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < steps.length; i++) {
        const el = steps[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - anchor);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      setActive((prev) => (prev === bestIdx ? prev : bestIdx));
    };

    const schedule = () => {
      if (ticking || !inView) return;
      ticking = true;
      raf = requestAnimationFrame(pick);
    };

    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        viewportH = window.innerHeight;
        schedule();
      }, 120);
    };

    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                inView = e.isIntersecting;
                if (inView) schedule();
              }
            },
            { rootMargin: "200px 0px" },
          )
        : null;
    if (io && sceneRef.current) io.observe(sceneRef.current);

    pick();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      io?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, []);


  return (
    <section
      ref={sceneRef}
      aria-labelledby="workflow-title"
      className="border-b border-hairline"
    >
      <div className="mx-auto max-w-6xl px-6 pt-20 md:pt-24">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-ink">
          Working with SeoVista
        </p>
        <h2 id="workflow-title" className="mt-2 font-serif text-3xl text-ink md:text-4xl">
          One workflow. Three deliberate moves.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-ink">
          Not three separate services — one editorial method that reads a page,
          weighs its visibility, and returns an ordered plan.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-16 md:pb-24 md:pt-10">
        {/* Left — step narratives */}
        <div>
          {WORKFLOW_STEPS.map((step, i) => {
            const isActive = active === i;
            return (
            <div
              key={step.id}
              data-step={i}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              role="group"
              tabIndex={0}
              aria-labelledby={`workflow-step-${step.id}-title`}
              aria-current={isActive ? "step" : undefined}
              className={
                "relative flex flex-col justify-center rounded-md border-t border-hairline py-10 pl-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-4 focus-visible:ring-offset-paper first:border-t-0 first:pt-0 md:min-h-[55vh] md:py-14 md:pl-6"
              }
            >
              <span
                aria-hidden="true"
                className={
                  "absolute left-0 top-10 bottom-10 w-0.5 rounded-full transition-colors md:top-14 md:bottom-14 " +
                  (isActive ? "bg-signal" : "bg-transparent")
                }
              />
              <p
                className={
                  "font-mono text-xs uppercase tracking-widest transition-colors " +
                  (isActive ? "font-semibold text-ink" : "text-muted-ink")
                }
              >
                {step.eyebrow}
                {isActive && <span className="sr-only"> (current step)</span>}
              </p>
              <h3
                id={`workflow-step-${step.id}-title`}
                className="mt-3 font-serif text-2xl text-ink md:text-3xl"
              >
                {step.title}
              </h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-ink">{step.body}</p>
              <ul className="mt-6 space-y-2">
                {step.points.map((p) => (
                  <li
                    key={p}
                    className={
                      "grid grid-cols-[auto_1fr] items-baseline gap-3 font-mono text-[11px] uppercase tracking-widest transition-colors " +
                      (isActive ? "text-ink" : "text-muted-ink")
                    }
                  >
                    <span aria-hidden="true" className="h-1 w-1 translate-y-[-2px] rounded-full bg-signal" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Link
                  to={step.discipline.to}
                  hash={step.discipline.hash}
                  className="inline-flex items-center gap-2 border-b border-hairline pb-0.5 font-mono text-xs uppercase tracking-widest text-ink transition-colors hover:border-ink"
                >
                  {step.discipline.label}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>


              {/* Mobile — inline preview under each step */}
              <div className="mt-8 md:hidden">
                <WorkflowPreview highlight={step.highlight} stepLabel={step.eyebrow} />
              </div>
            </div>
            );
          })}
        </div>

        {/* Right — sticky preview that reacts to scroll */}
        <aside className="hidden md:block" aria-label="Workflow preview">
          <div className="sticky top-24">
            <div className="relative w-full">
              <div
                className="absolute -top-8 right-0 flex items-center justify-end gap-2"
                role="tablist"
                aria-label={`Workflow step ${active + 1} of ${WORKFLOW_STEPS.length}`}
              >
                {WORKFLOW_STEPS.map((s, i) => {
                  const isActive = active === i;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Go to ${s.eyebrow}`}
                      onClick={() => {
                        const el = stepRefs.current[i];
                        if (!el) return;
                        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                        el.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
                        el.focus({ preventScroll: true });
                      }}
                      className={
                        "inline-flex h-6 w-8 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={
                          "block h-1 w-6 rounded-full transition-colors " +
                          (isActive ? "bg-ink" : "bg-muted-ink/40")
                        }
                      />
                    </button>
                  );
                })}
              </div>
              <WorkflowPreview
                highlight={WORKFLOW_STEPS[active].highlight}
                stepLabel={WORKFLOW_STEPS[active].eyebrow}
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function WorkflowPreview({
  highlight,
  stepLabel,
}: {
  highlight?: readonly string[];
  stepLabel?: string;
}) {
  const highlightSet = highlight ? new Set(highlight) : null;
  return (
    <div>
      <div
        className="rounded-lg border border-hairline bg-card"
        role="region"
        aria-label="Illustrative preview of workflow output"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-ink">
              Illustrative preview
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-ink">
            example.com/page
          </span>
        </div>

        {stepLabel && (
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            Showing preview for {stepLabel}
          </p>
        )}

        <ul className="space-y-4 px-5 py-5">
          {PREVIEW_ROWS.map((row) => {
            const isActive = !highlightSet || highlightSet.has(row.key);
            return (
              <li
                key={row.label}
                aria-current={highlightSet && isActive ? "true" : undefined}
                className={
                  "grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-hairline pt-4 transition-opacity duration-300 first:border-t-0 first:pt-0 " +
                  (isActive ? "opacity-100" : "opacity-60")
                }
              >
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-ink">
                  {row.label}
                </div>
                <div className="text-sm text-ink">{row.detail}</div>
                <span
                  className={
                    "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest " +
                    (row.tag === "observed"
                      ? "border-signal/60 bg-signal/15 text-ink"
                      : row.tag === "review"
                        ? "border-hairline bg-paper text-muted-ink"
                        : "border-hairline bg-mineral text-muted-ink")
                  }
                >
                  <span className="sr-only">Status: </span>
                  {row.tag}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-ink">
        Static illustration of the intended workflow. No audit runs.
      </p>
    </div>
  );
}

