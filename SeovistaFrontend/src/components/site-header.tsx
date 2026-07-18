import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PUBLIC_ROUTES, SITE_NAME } from "@/lib/site-config";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="flex items-baseline gap-2 font-serif text-xl tracking-tight text-ink"
          aria-label={`${SITE_NAME} — home`}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
          <span>{SITE_NAME}</span>
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-7 text-sm text-muted-ink">
            {PUBLIC_ROUTES.filter((r) => r.path !== "/").map((r) => (
              <li key={r.path}>
                <Link
                  to={r.path}
                  className="transition-colors hover:text-ink"
                  activeProps={{ className: "text-ink" }}
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-hairline text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-hairline bg-paper md:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col px-6 py-3">
            {PUBLIC_ROUTES.filter((r) => r.path !== "/").map((r) => (
              <li key={r.path}>
                <Link
                  to={r.path}
                  onClick={() => setOpen(false)}
                  className="block py-3 text-base text-ink"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
