import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary";

const base =
  "inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium transition-colors min-h-11";
const variants: Record<Variant, string> = {
  primary: "bg-signal text-signal-foreground hover:bg-signal/90",
  secondary: "border border-hairline bg-paper text-ink hover:bg-mineral",
};

export function CtaLink({
  to,
  variant = "primary",
  children,
  ...rest
}: {
  to: ComponentProps<typeof Link>["to"];
  variant?: Variant;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "to" | "children" | "className">) {
  return (
    <Link to={to} className={`${base} ${variants[variant]}`} {...rest}>
      {children}
    </Link>
  );
}

export function CtaAnchor({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <a href={href} className={`${base} ${variants[variant]}`}>
      {children}
    </a>
  );
}
