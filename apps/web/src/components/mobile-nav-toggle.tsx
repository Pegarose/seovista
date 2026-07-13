"use client";

import { useState, useCallback, useEffect } from "react";
import { Link } from "@seovista/ui";

interface NavItem {
  label: string;
  href: string;
}

export interface MobileNavToggleProps {
  readonly items: NavItem[];
}

export function MobileNavToggle({ items }: MobileNavToggleProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  useEffect(() => {
    if (!open) return;
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-light bg-paper text-ink transition-colors hover:bg-mineral focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <span className="sr-only">Menu</span>
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="absolute left-0 right-0 top-full border-b border-border-light bg-paper shadow-lg"
        >
          <ul className="mx-auto max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
            {items.map((item) => (
              <li key={item.href} className="border-b border-border-light last:border-b-0">
                <Link
                  href={item.href}
                  variant="nav"
                  underline="none"
                  className="block py-3"
                  onClick={close}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-3">
              <Link href="/contact/" variant="cta" underline="none" className="font-medium">
                Get a GEO Audit
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
