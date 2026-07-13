import * as React from "react";
import type { ReactNode } from "react";

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
