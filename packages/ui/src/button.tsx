import * as React from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly variant?: "primary" | "secondary" | "outline" | "ghost";
  readonly size?: "sm" | "md" | "lg";
}

const variantClasses = {
  primary:
    "bg-spectral-blue text-paper hover:bg-spectral-blue/90",
  secondary:
    "bg-signal-green text-ink hover:bg-signal-green/90",
  outline:
    "border border-border-light text-ink hover:bg-mineral hover:border-ink",
  ghost:
    "text-ink hover:bg-mineral",
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
  const classes = `inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
