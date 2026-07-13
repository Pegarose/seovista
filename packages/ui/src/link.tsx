import * as React from "react";
import type { ReactNode, AnchorHTMLAttributes } from "react";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly children: ReactNode;
  readonly variant?: "default" | "muted" | "nav" | "footer" | "cta";
  readonly underline?: "always" | "hover" | "none";
  readonly external?: boolean;
}

const variantClasses = {
  default: "text-spectral-blue hover:text-ink",
  muted: "text-muted hover:text-ink",
  nav: "text-ink hover:text-spectral-blue",
  footer: "text-muted hover:text-ink",
  cta: "text-signal-green hover:text-ink",
} as const;

const underlineClasses = {
  always: "underline underline-offset-4",
  hover: "hover:underline underline-offset-4",
  none: "no-underline",
} as const;

export function Link({
  children,
  variant = "default",
  underline = "hover",
  external = false,
  className = "",
  ...props
}: LinkProps): React.ReactElement {
  const externalAttrs = external
    ? { target: "_blank", rel: "noopener noreferrer", "aria-label": `${props["aria-label"] ?? children} (opens in a new tab)` }
    : {};

  return (
    <a
      className={`inline-flex items-center rounded-sm transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${variantClasses[variant]} ${underlineClasses[underline]} ${className}`}
      {...props}
      {...externalAttrs}
    >
      {children}
    </a>
  );
}
