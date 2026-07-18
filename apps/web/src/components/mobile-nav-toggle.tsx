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
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-hairline bg-paper text-ink transition-colors hover:bg-mineral focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <span className="sr-only">Menu</span>
        <svg
          className="h-[18px] w-[18px]"
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
          className="border-t border-hairline bg-paper md:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-6 py-3">
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} variant="nav" underline="none" className="block py-3 text-base" onClick={close}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
