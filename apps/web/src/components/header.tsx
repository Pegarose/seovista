import { Link } from "@seovista/ui";
import { MobileNavToggle } from "./mobile-nav-toggle";

interface NavItem { label: string; href: string; }

const navItems: NavItem[] = [
  { label: "SEO", href: "/seo/" },
  { label: "GEO", href: "/geo/" },
  { label: "Digital Authority", href: "/digital-authority/" },
  { label: "Tools", href: "/tools/" },
  { label: "Insights", href: "/insights/" },
  { label: "About", href: "/about/" },
  { label: "Contact", href: "/contact/" },
];

export function Header({ pathname }: { pathname: string }): React.ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur" role="banner">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" variant="nav" underline="none" className="flex items-baseline gap-2 font-serif text-xl tracking-tight text-ink" aria-label="SeoVista home">
          <span className="inline-block h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
          <span>SeoVista</span>
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-7 text-sm text-muted-ink">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return <li key={item.href}><Link href={item.href} variant="nav" underline="none" aria-current={isActive ? "page" : undefined} className={`transition-colors hover:text-ink ${isActive ? "font-medium text-ink" : "text-muted-ink"}`}>{item.label}</Link></li>;
            })}
          </ul>
        </nav>
        <MobileNavToggle items={navItems} />
      </div>
    </header>
  );
}
