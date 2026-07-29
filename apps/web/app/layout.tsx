import "./globals.css";
import { Fraunces, Inter_Tight } from "next/font/google";
import { Header } from "../src/components/header";
import { Footer } from "../src/components/footer";
import type { Metadata } from "next";
import { homePage, siteUrl } from "../src/content/site";
import { headers } from "next/headers";

const fraunces = Fraunces({
  display: "swap",
  fallback: ["Georgia", "serif"],
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  weight: "variable",
});

const interTight = Inter_Tight({
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  subsets: ["latin"],
  variable: "--font-inter-tight",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: "%s",
    default: homePage.title,
  },
  description: homePage.description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const pathname = (await headers()).get("x-seovista-pathname") ?? "";
  const isAdmin = pathname.startsWith("/admin");

  return (
    <html lang="en" className={`${fraunces.variable} ${interTight.variable} scroll-smooth`}>
      <body className={isAdmin ? "min-h-screen antialiased" : "flex min-h-screen flex-col bg-paper text-ink antialiased"}>
        {isAdmin ? children : (
          <>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-paper focus:px-4 focus:py-2 focus:text-ink focus-outline-spectral"
            >
              Skip to main content
            </a>
            <Header pathname={pathname} />
            <div className="flex-1">{children}</div>
            <Footer />
          </>
        )}
      </body>
    </html>
  );
}
