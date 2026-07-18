import { StatusBadge } from "../../src/components/editorial";
import { JsonLd } from "../../src/components/json-ld";
import { cookiesPage } from "../../src/content/site";
import { buildPageGraph } from "../../src/lib/jsonld";
import { pageMetadataFrom } from "../../src/lib/metadata";

export const metadata = pageMetadataFrom(cookiesPage);
export default function CookiesPage(): React.ReactElement { return <><JsonLd graph={buildPageGraph(cookiesPage)} /><main id="main"><article><header className="border-b border-hairline"><div className="mx-auto max-w-4xl px-6 py-20"><StatusBadge>Legal · Foundation draft</StatusBadge><h1 className="mt-6 font-serif text-4xl text-ink">Cookies.</h1></div></header><section className="mx-auto max-w-3xl px-6 py-16 text-muted-ink"><p>This site does not currently set advertising, analytics, profiling, or third-party marketing cookies. Only the strictly necessary cookies required for the site to function may be present.</p><p className="mt-6">If cookie use changes in a future release, this page will describe each cookie's purpose, provider, and retention, and a consent mechanism will be introduced before non-essential cookies are set.</p><p className="mt-10 text-xs uppercase tracking-widest">This document is a foundation-stage draft pending final legal review.</p></section></article></main></>; }
