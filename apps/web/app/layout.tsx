import "./globals.css";
import { Header } from "../src/components/header";
import { Footer } from "../src/components/footer";
import { homePage, siteUrl } from "../src/content/site";
import { buildMetadata } from "@seovista/seo-core";

export const metadata = buildMetadata(siteUrl, {
  title: homePage.title,
  description: homePage.description,
  canonicalPath: homePage.canonical.path,
});

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
