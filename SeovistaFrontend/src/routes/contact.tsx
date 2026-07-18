import { createFileRoute } from "@tanstack/react-router";
import { CtaAnchor } from "@/components/cta";
import { StatusBadge } from "@/components/editorial";
import { canonicalFor } from "@/lib/site-config";

const TITLE = "Contact — SeoVista";
const DESC =
  "Reach SeoVista by email for editorial, research, or collaboration enquiries. No submission form is available in the foundation release.";

const CONTACT_EMAIL = "hello@seovista.example";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/contact/") },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/contact/") }],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <article>
      <header className="border-b border-hairline">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <StatusBadge>Contact</StatusBadge>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-ink md:text-5xl">
            Get in touch.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-ink">
            The foundation release does not include a submission form — a form
            without a submission backend would be dishonest. Email is the
            fastest way to reach us.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-lg border border-hairline bg-card p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-ink">Email</p>
          <p className="mt-2 font-serif text-2xl text-ink">
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-4 text-sm text-muted-ink">
            Please include a short description of what you're working on and
            the timeframe you're operating in. We reply to every genuine
            enquiry.
          </p>
          <div className="mt-6">
            <CtaAnchor href={`mailto:${CONTACT_EMAIL}`} variant="primary">
              Compose email
            </CtaAnchor>
          </div>
        </div>
      </section>
    </article>
  );
}
