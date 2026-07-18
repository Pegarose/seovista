import { CtaAnchor, StatusBadge } from "../../src/components/editorial";
import { JsonLd } from "../../src/components/json-ld";
import { contactPage } from "../../src/content/site";
import { buildPageGraph } from "../../src/lib/jsonld";
import { pageMetadataFrom } from "../../src/lib/metadata";

export const metadata = pageMetadataFrom(contactPage);
const CONTACT_EMAIL = "hello@seovista.example";

export default function ContactPage(): React.ReactElement {
  return <><JsonLd graph={buildPageGraph(contactPage)} /><main id="main"><article><header className="border-b border-hairline"><div className="mx-auto max-w-4xl px-6 py-20"><StatusBadge>Contact</StatusBadge><h1 className="mt-6 font-serif text-4xl leading-tight text-ink md:text-5xl">Get in touch.</h1><p className="mt-6 text-lg leading-relaxed text-muted-ink">The foundation release does not include a submission form, a form without a submission backend would be dishonest. Email is the fastest way to reach us.</p></div></header><section className="mx-auto max-w-3xl px-6 py-16"><div className="rounded-lg border border-hairline bg-card p-8"><p className="font-mono text-xs uppercase tracking-widest text-muted-ink">Email</p><p className="mt-2 font-serif text-2xl text-ink"><a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-4">{CONTACT_EMAIL}</a></p><p className="mt-4 text-sm text-muted-ink">Please include a short description of what you're working on and the timeframe you're operating in. We reply to every genuine enquiry.</p><div className="mt-6"><CtaAnchor href={`mailto:${CONTACT_EMAIL}`}>Compose email</CtaAnchor></div></div></section></article></main></>;
}
