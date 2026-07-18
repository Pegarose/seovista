import { Link } from "@tanstack/react-router";
import { LEGAL_ROUTES, PUBLIC_ROUTES, SITE_NAME } from "@/lib/site-config";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-hairline bg-mineral/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-baseline gap-2 font-serif text-lg text-ink">
            <span className="inline-block h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
            {SITE_NAME}
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-ink">
            An editorial intelligence lab studying generative engine optimization,
            traditional search, and digital authority. Currently in foundation stage.
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink">Explore</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-ink">
            {PUBLIC_ROUTES.filter((r) => r.path !== "/").map((r) => (
              <li key={r.path}>
                <Link to={r.path} className="hover:text-ink">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink">Legal</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-ink">
            {LEGAL_ROUTES.map((r) => (
              <li key={r.path}>
                <Link to={r.path} className="hover:text-ink">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-muted-ink md:flex-row md:items-center md:justify-between">
          <p>© {year} {SITE_NAME}. All rights reserved.</p>
          <p>Foundation release · Sprint 0</p>
        </div>
      </div>
    </footer>
  );
}
