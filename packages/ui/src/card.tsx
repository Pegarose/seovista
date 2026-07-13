import * as React from "react";
import type { ReactNode } from "react";

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
