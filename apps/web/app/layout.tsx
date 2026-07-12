import "./globals.css";

export const metadata = {
  title: "SeoVista",
  description: "AI visibility and GEO readiness platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2">
          Skip to main content
        </a>
        <header className="border-b px-4 py-3">
          <nav aria-label="Primary">
            <a href="/" className="font-semibold">
              SeoVista
            </a>
          </nav>
        </header>
        {children}
        <footer className="border-t px-4 py-6 text-sm">
          <p>&copy; {new Date().getFullYear()} SeoVista. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
