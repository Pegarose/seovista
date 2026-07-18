import { createFileRoute } from "@tanstack/react-router";
import { DisciplineHero } from "@/components/discipline-hero";
import { CtaLink } from "@/components/cta";
import { UnavailableState } from "@/components/editorial";
import { canonicalFor } from "@/lib/site-config";

const TITLE = "GEO Readiness Checker (foundation preview) — SeoVista";
const DESC =
  "A brief for a future SeoVista instrument that will assess how a page presents itself to generative answer systems. Nothing runs in this release: no form, no score, no report.";

export const Route = createFileRoute("/tools/geo-readiness-checker")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/tools/geo-readiness-checker/") },
      { property: "og:type", content: "article" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/tools/geo-readiness-checker/") }],
  }),
  component: CheckerPage,
});

type MethodRow = {
  id: string;
  title: string;
  detail: string;
};

const WILL_ASSESS: MethodRow[] = [
  {
    id: "01",
    title: "Subject & audience clarity",
    detail: "Whether a page states what it is about and who it is for, without ambiguity.",
  },
  {
    id: "02",
    title: "Attributable claims",
    detail: "Whether factual claims can be traced to identifiable, primary sources.",
  },
  {
    id: "03",
    title: "Markup ↔ content parity",
    detail: "Whether structured markup matches the visible content of the page.",
  },
  {
    id: "04",
    title: "Authorship & organisation",
    detail: "Whether the author and organisation behind the page are transparent.",
  },
  {
    id: "05",
    title: "Crawl & render integrity",
    detail: "Whether a well-behaved crawler can reach and render the page in full.",
  },
];

const WILL_NOT: MethodRow[] = [
  {
    id: "01",
    title: "Guarantee inclusion",
    detail: "No instrument can promise a page will appear in any generative system.",
  },
  {
    id: "02",
    title: "Promise ranking outcomes",
    detail: "Rankings depend on systems and inputs we do not control.",
  },
  {
    id: "03",
    title: "Fabricate a score",
    detail: "No number will be invented to make a page look better than it is.",
  },
];

function CheckerPage() {
  return (
    <article className="bg-paper text-ink">
      <DisciplineHero
        number="04·01"
        displayName="Readiness"
        accessibleName="GEO Readiness Checker"
        lede="A brief for a future instrument. It does not accept URLs, does not produce a score, and does not generate a report — the description is the release."
        capabilities={[
          "Subject & audience clarity",
          "Attributable claims",
          "Markup ↔ content parity",
          "Authorship & organisation",
          "Crawl & render integrity",
        ]}
        supportingNote="Non-operational preview. Published so the intent is on the record before the engine is built."
        inquireTo="/contact"
        inquireLabel="Get notified when it goes live"
      />

      {/* Method sheet */}
      <section className="mx-auto w-full max-w-7xl px-6 pb-24 md:px-16 md:pb-32">
        <div className="grid grid-cols-1 gap-16 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-3">
            <span className="sticky top-24 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
              Method Sheet
            </span>
          </div>

          <div className="md:col-span-9 flex flex-col gap-16">
            <section>
              <h2 className="font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-signal">
                What it will assess
              </h2>
              <ul className="mt-6 flex flex-col divide-y divide-hairline border-y border-hairline">
                {WILL_ASSESS.map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-[3rem_1fr] items-baseline gap-x-6 py-6"
                  >
                    <span className="font-mono text-xs tabular-nums text-muted-ink">
                      {row.id}
                    </span>
                    <div>
                      <h3 className="font-serif text-xl text-ink">{row.title}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-ink">
                        {row.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-ember">
                What it will not do
              </h2>
              <ul className="mt-6 flex flex-col divide-y divide-hairline border-y border-hairline">
                {WILL_NOT.map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-[3rem_1fr] items-baseline gap-x-6 py-6"
                  >
                    <span className="font-mono text-xs tabular-nums text-muted-ink">
                      {row.id}
                    </span>
                    <div>
                      <h3 className="font-serif text-xl text-ink">{row.title}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-ink">
                        {row.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-muted-ink">
                Why it is not live yet
              </h2>
              <p className="mt-4 max-w-2xl font-serif text-xl leading-relaxed text-ink">
                We would rather publish the brief than ship a demo that pretends
                to analyse real pages. The instrument goes live when its output
                is one we would defend in writing.
              </p>
            </section>

            <div>
              <UnavailableState
                title="This capability is not operational in the foundation release."
                description="No user data is being collected on this page. The instrument will announce itself when it is ready."
              />
              <div className="mt-8">
                <CtaLink to="/contact/" variant="secondary">
                  Get notified when it goes live
                </CtaLink>
              </div>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
