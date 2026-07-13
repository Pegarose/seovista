import { Link } from "@seovista/ui";

interface FooterLink {
  label: string;
  href: string;
}

const productLinks: FooterLink[] = [
  { label: "GEO", href: "/geo/" },
  { label: "SEO", href: "/seo/" },
  { label: "Digital Authority", href: "/digital-authority/" },
  { label: "Free Tools", href: "/tools/" },
];

const companyLinks: FooterLink[] = [
  { label: "About", href: "/about/" },
  { label: "Contact", href: "/contact/" },
  { label: "Insights", href: "/insights/" },
];

const legalLinks: FooterLink[] = [
  { label: "Privacy", href: "/privacy/" },
  { label: "Cookies", href: "/cookies/" },
  { label: "Terms", href: "/terms/" },
];

export function Footer(): React.ReactElement {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border-light bg-mineral" role="contentinfo">
      <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="text-lg font-semibold text-ink">SeoVista</p>
            <p className="mt-2 text-sm text-muted">
              GEO & search visibility intelligence.
            </p>
            <p className="mt-4 text-sm text-muted">
              A GMedya Group company
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">Product</p>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} variant="footer" className="text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">Company</p>
            <ul className="mt-3 space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} variant="footer" className="text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">Legal</p>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} variant="footer" className="text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border-light pt-6">
          <p className="text-sm text-muted">
            &copy; {year} SeoVista. A GMedya Group company. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
