import * as React from "react";
import type { ReactNode, AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

export interface ContainerProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly as?: "div" | "section" | "article" | "main" | "header" | "footer" | "nav" | "aside";
}

export function Container({
  children,
  className = "",
  as: Component = "div",
}: ContainerProps): React.ReactElement {
  return (
    <Component className={`mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </Component>
  );
}

export interface SectionProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly as?: "section" | "article" | "div";
  readonly padding?: "sm" | "md" | "lg" | "xl";
}

const paddingClasses = {
  sm: "py-6",
  md: "py-10",
  lg: "py-14",
  xl: "py-20",
} as const;

export function Section({
  children,
  className = "",
  as: Component = "section",
  padding = "md",
}: SectionProps): React.ReactElement {
  return <Component className={`${paddingClasses[padding]} ${className}`}>{children}</Component>;
}

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

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly variant?: "primary" | "secondary" | "outline" | "ghost";
  readonly size?: "sm" | "md" | "lg";
}

const buttonVariantClasses = {
  primary: "bg-spectral-blue text-paper hover:bg-spectral-blue/90",
  secondary: "bg-signal-green text-ink hover:bg-signal-green/90",
  outline: "border border-border-light text-ink hover:bg-mineral hover:border-ink",
  ghost: "text-ink hover:bg-mineral",
} as const;

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm min-h-[2rem]",
  md: "px-4 py-2 text-base min-h-[2.75rem]",
  lg: "px-6 py-3 text-lg min-h-[3rem]",
} as const;

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps): React.ReactElement {
  const classes = `inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed ${buttonVariantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}

export interface CardProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly as?: "article" | "div" | "section";
}

export function Card({
  children,
  className = "",
  as: Component = "article",
}: CardProps): React.ReactElement {
  return (
    <Component className={`rounded-xl border border-border-light bg-paper p-6 transition-transform duration-200 hover:translate-y-[-2px] ${className}`}>
      {children}
    </Component>
  );
}
