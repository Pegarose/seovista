import { createFileRoute } from "@tanstack/react-router";
import { StatusBadge } from "@/components/editorial";
import { ContrastMatrix } from "@/components/contrast-matrix";
import { canonicalFor, SITE_NAME } from "@/lib/site-config";

const TITLE = `Contrast check — ${SITE_NAME}`;
const DESC =
  "Live WCAG 2.1 contrast audit of the SeoVista design tokens. Each interface pair is graded AA or AAA against the current color scheme.";

export const Route = createFileRoute("/design/contrast")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/design/contrast/") },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/design/contrast/") }],
  }),
  component: ContrastPage,
});

function ContrastPage() {
  return (
    <article>
      <header className="border-b border-hairline">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <StatusBadge>Design system</StatusBadge>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-ink md:text-5xl">
            WCAG contrast check
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-ink">
            An automated audit of the color pairs used across the interface.
            Ratios are computed from the live design tokens, so switching color
            schemes updates the results in place.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-16">
        <ContrastMatrix />

        <div className="mt-8 grid gap-4 text-sm text-muted-ink sm:grid-cols-3">
          <div className="rounded-md border border-hairline bg-card p-4">
            <div className="font-semibold text-ink">AAA</div>
            <p className="mt-1">
              Ratio ≥ 7:1 for body text, ≥ 4.5:1 for large text. Best for long
              reading.
            </p>
          </div>
          <div className="rounded-md border border-hairline bg-card p-4">
            <div className="font-semibold text-ink">AA</div>
            <p className="mt-1">
              Ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text. Minimum for
              legal compliance in most regions.
            </p>
          </div>
          <div className="rounded-md border border-hairline bg-card p-4">
            <div className="font-semibold text-ink">Fail</div>
            <p className="mt-1">
              Below AA. Reserve for decorative elements that never carry
              information on their own.
            </p>
          </div>
        </div>
      </section>
    </article>
  );
}
