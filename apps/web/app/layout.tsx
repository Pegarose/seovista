import "./globals.css";
import { Header } from "../src/components/header";
import { Footer } from "../src/components/footer";
import type { Metadata } from "next";
import { siteUrl } from "../src/content/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: "%s",
    default: "SeoVista — GEO & Search Visibility Intelligence",
  },
  description:
    "Editorial intelligence lab for generative engine optimization and search visibility.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-paper focus:px-4 focus:py-2 focus:text-ink focus-outline-spectral"
        >
          Skip to main content
        </a>
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
