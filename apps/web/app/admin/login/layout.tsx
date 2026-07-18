import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin sign in | SeoVista",
  description: "Sign in to the private SeoVista operations console.",
  robots: { index: false, follow: false },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return children as React.ReactElement;
}
