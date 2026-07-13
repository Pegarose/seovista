import * as React from "react";
import type { ReactNode } from "react";

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
