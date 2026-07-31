import { DisciplineHero } from "../../src/components/discipline-layout";
import { JsonLd } from "../../src/components/json-ld";
import { toolsPage } from "../../src/content/site";
import { buildPageGraph } from "../../src/lib/jsonld";
import { pageMetadataFrom } from "../../src/lib/metadata";

export const metadata = pageMetadataFrom(toolsPage);

type Instrument = { id: string; name: string; status: "Preview" | "Planned"; summary: string; href?: string };
const instruments: Instrument[] = [
  { id: "01", name: "GEO Readiness Checker", status: "Preview", summary: "Assesses how a page presents itself to generative answer systems. Brief is published; the audit engine is not connected.", href: "/tools/geo-readiness-checker/" },
  { id: "02", name: "Schema Checker", status: "Preview", summary: "Fetches a page, parses every JSON-LD block, and reports syntax errors, prohibited claims, and a structural score.", href: "/tools/schema-checker/" },
  { id: "03", name: "AI Crawler Checker", status: "Preview", summary: "Fetches a site's robots.txt and reports, per bot, whether AI search, AI training, and traditional search crawlers are allowed, partially restricted, or blocked.", href: "/tools/ai-crawler-checker/" },
  { id: "04", name: "Attribution Trace", status: "Planned", summary: "Maps a synthesized answer back to the sources a generative system likely drew from, and flags misattribution." },
  { id: "05", name: "Render Parity Diff", status: "Planned", summary: "Compares what a crawler sees against what a user sees, so gaps in server-rendered content surface before they hurt retrieval." },
  { id: "06", name: "Schema Truth Check", status: "Planned", summary: "Verifies that structured markup matches the visible page, with no claims in JSON-LD that a reader cannot find on the page itself." },
];

function StatusPill({ status }: { status: Instrument["status"] }): React.ReactElement { return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${status === "Preview" ? "border-spectral/40 text-spectral" : "border-hairline text-muted-ink"}`}><span className={`inline-block h-1.5 w-1.5 rounded-full ${status === "Preview" ? "bg-spectral" : "bg-muted-ink/60"}`} />{status}</span>; }

export default function ToolsPage(): React.ReactElement {
  return <><JsonLd graph={buildPageGraph(toolsPage)} /><main id="main"><article className="bg-paper text-ink"><DisciplineHero number="04" displayName="Instruments" lede="A small library of purpose-built instruments for measuring retrieval, attribution, and render parity. We publish briefs before we ship engines." capabilities={["Three previews available", "Three briefs in planning", "No fabricated scores"]} supportingNote="Every instrument earns its release. We would rather publish a truthful brief than a demo that pretends to analyse real pages." inquireTo="/contact/" inquireLabel="Request early access" /><section className="mx-auto w-full max-w-7xl px-6 pb-24 md:px-16 md:pb-40"><div className="grid grid-cols-1 gap-8 md:grid-cols-12"><div className="md:col-span-3"><span className="sticky top-24 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">Instrument Index</span></div><div className="md:col-span-9"><ul className="flex flex-col divide-y divide-hairline border-y border-hairline">{instruments.map((instrument) => <li key={instrument.id}>{instrument.href ? <a href={instrument.href} className="group block transition-colors hover:bg-mineral/30"><InstrumentRow instrument={instrument} /></a> : <div className="block opacity-80"><InstrumentRow instrument={instrument} /></div>}</li>)}</ul><p className="mt-10 max-w-2xl font-serif text-lg italic leading-relaxed text-muted-ink">"No instrument ships until it produces a result we would defend in writing."</p></div></div></section></article></main></>;
}

function InstrumentRow({ instrument }: { instrument: Instrument }): React.ReactElement { return <div className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-x-6 gap-y-3 py-8"><span className="font-mono text-xs tabular-nums text-muted-ink">{instrument.id}</span><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-serif text-2xl leading-tight text-ink md:text-3xl">{instrument.name}</h2><StatusPill status={instrument.status} /></div><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-ink md:text-base">{instrument.summary}</p></div><span className="hidden self-baseline font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink md:inline">{instrument.href ? "Read brief →" : "In planning"}</span></div>; }
