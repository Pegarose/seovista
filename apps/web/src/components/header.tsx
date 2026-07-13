import { Link } from "@/components/ui";
import { MobileNavToggle } from "./mobile-nav-toggle";

interface NavItem {
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { label: "GEO", href: "/geo/" },
  { label: "SEO", href: "/seo/" },
  { label: "Digital Authority", href: "/digital-authority/" },
  { label: "Free Tools", href: "/tools/" },
  { label: "Insights", href: "/insights/" },
  { label: "About", href: "/about/" },
];

export function Header(): React.ReactElement {
  return (
    <header className="sticky top-0 z-50 border-b border-border-light bg-paper/95 backdrop-blur-sm" role="banner">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            variant="nav"
            underline="none"
            className="py-3 text-lg font-semibold"
            aria-label="SeoVista home"
          >
            SeoVista
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} variant="nav" underline="none" className="px-3 py-2 text-sm">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/contact/"
            variant="cta"
            underline="none"
            className="hidden rounded-lg bg-signal-green px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-signal-green/90 focus-visible:ring-2 focus-visible:ring-spectral-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:inline-flex"
          >
            Get a GEO Audit
          </Link>
          <MobileNavToggle items={navItems} />
        </div>
      </div>
    </header>
  );
}
