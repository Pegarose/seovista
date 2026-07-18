import { Link } from "@seovista/ui";

const exploreLinks = [
  ["GEO", "/geo/"], ["SEO", "/seo/"], ["Digital Authority", "/digital-authority/"], ["Tools", "/tools/"], ["Insights", "/insights/"], ["About", "/about/"], ["Contact", "/contact/"],
] as const;
const legalLinks = [["Privacy", "/privacy/"], ["Cookies", "/cookies/"], ["Terms", "/terms/"]] as const;

export function Footer(): React.ReactElement {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-hairline bg-mineral/60" role="contentinfo">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-baseline gap-2 font-serif text-lg text-ink"><span className="inline-block h-2 w-2 rounded-full bg-signal" aria-hidden="true" />SeoVista</div>
          <p className="mt-3 max-w-sm text-sm text-muted-ink">An editorial intelligence lab studying generative engine optimization, traditional search, and digital authority. Currently in foundation stage.</p>
          <p className="mt-4 text-sm text-muted-ink">A GMedya Group company</p>
        </div>
        <div><h2 className="text-xs font-semibold uppercase tracking-widest text-ink">Explore</h2><ul className="mt-4 space-y-2 text-sm text-muted-ink">{exploreLinks.map(([label, href]) => <li key={href}><Link href={href} variant="footer" underline="none" className="hover:text-ink">{label}</Link></li>)}</ul></div>
        <div><h2 className="text-xs font-semibold uppercase tracking-widest text-ink">Legal</h2><ul className="mt-4 space-y-2 text-sm text-muted-ink">{legalLinks.map(([label, href]) => <li key={href}><Link href={href} variant="footer" underline="none" className="hover:text-ink">{label}</Link></li>)}</ul></div>
      </div>
      <div className="border-t border-hairline"><div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-muted-ink md:flex-row md:items-center md:justify-between"><p>© {year} SeoVista. All rights reserved.</p><p>Foundation release · Sprint 0</p></div></div>
    </footer>
  );
}
