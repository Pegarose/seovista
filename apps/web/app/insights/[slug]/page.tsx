import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { getAdminDb } from "@/lib/admin/db";
import { createCmsRepository } from "@seovista/worker";
import { BlockRenderer } from "@/components/cms/block-renderer";

interface PageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const db = getAdminDb();
  const repo = createCmsRepository(db);

  try {
    const insight = await repo.getPublishedInsightBySlug(params.slug, {
      trustedSiteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://seovista.app",
      mode: { kind: "public", now: new Date() },
      supportedLocales: ["en"],
      defaultLocale: "en"
    });

    if (!insight) {
      return {
        title: "Insight Not Found | SeoVista",
      };
    }

    return {
      title: `${insight.title} | Insights | SeoVista`,
      // Additional metadata can be added here if needed based on insight
    };
  } catch (error) {
    return {
      title: "Insight Not Found | SeoVista",
    };
  }
}

export default async function InsightPage({ params }: PageProps) {
  const db = getAdminDb();
  const repo = createCmsRepository(db);

  let insight;
  try {
    insight = await repo.getPublishedInsightBySlug(params.slug, {
      trustedSiteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://seovista.app",
      mode: { kind: "public", now: new Date() },
      supportedLocales: ["en"],
      defaultLocale: "en"
    });
  } catch (error) {
    console.error("Failed to fetch insight:", error);
    notFound();
  }

  if (!insight) {
    notFound();
  }

  return (
    <main className="insight-page-container mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">{insight.title}</h1>
      <article className="insight-content">
        <BlockRenderer blocks={insight.blocks as any} />
      </article>
    </main>
  );
}
