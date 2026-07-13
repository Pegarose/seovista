import type { Adapter, ContentEntity, FAQ, Page } from "@seovista/content-models";
import {
  buildFeedXml,
  buildLlmsTxt,
  buildMetadata,
  buildSitemapUrl,
  buildSitemapXml,
  resolveCanonical,
} from "@seovista/seo-core";
import { buildFAQPage, buildGraph, buildWebPage, type SchemaNode } from "@seovista/schema";

export interface PublicProjectionMatrixOptions {
  readonly adapter: Adapter;
  readonly siteUrl: string;
  readonly now: string;
}

export interface PublicProjectionMatrix {
  readonly html: readonly string[];
  readonly metadata: readonly string[];
  readonly jsonLd: readonly string[];
  readonly sitemap: string;
  readonly feed: string;
  readonly llms: string;
}

type TitledContent = Extract<ContentEntity, { title: string; description: string }>;

function isTrustedEntity(
  entity: ContentEntity,
  siteUrl: string,
  supportedLocales: readonly string[]
): boolean {
  if (!supportedLocales.includes(entity.locale)) return false;
  try {
    return entity.canonical.absolute === resolveCanonical(siteUrl, entity.canonical.path);
  } catch {
    return false;
  }
}

function eligibleContent(
  options: PublicProjectionMatrixOptions,
  projection: Parameters<Adapter["readContent"]>[0]
): readonly ContentEntity[] {
  return options.adapter
    .readContent(projection)
    .filter((entity) =>
      isTrustedEntity(entity, options.siteUrl, options.adapter.options.supportedLocales)
    );
}

function isTitledContent(entity: ContentEntity): entity is TitledContent {
  return "title" in entity && "description" in entity;
}

function isPage(entity: ContentEntity): entity is Page {
  return entity.kind === "page";
}

function isFaq(entity: ContentEntity): entity is FAQ {
  return entity.kind === "faq";
}

function renderHtml(entity: ContentEntity): string {
  if (isTitledContent(entity)) {
    return `<article data-content-id="${entity.id}" data-canonical="${entity.canonical.absolute}"><h1>${entity.title}</h1><p>${entity.description}</p>${entity.body ?? ""}</article>`;
  }
  if (isFaq(entity)) {
    return `<section data-content-id="${entity.id}"><h2>${entity.question}</h2><p>${entity.answer}</p></section>`;
  }
  return `<section data-content-id="${entity.id}"></section>`;
}

function metadataProjection(entity: TitledContent, siteUrl: string): string {
  return JSON.stringify(
    buildMetadata(siteUrl, {
      title: entity.title,
      description: entity.description,
      canonicalPath: entity.canonical.path,
      indexable: entity.indexation.indexable,
      followLinks: entity.indexation.followLinks,
    })
  );
}

function jsonLdProjection(entity: ContentEntity, siteUrl: string): string | undefined {
  if (isPage(entity)) {
    return JSON.stringify(buildGraph([buildWebPage({ page: entity, siteUrl })]));
  }
  if (isFaq(entity)) {
    const pageUrl = resolveCanonical(siteUrl, entity.canonical.path);
    return JSON.stringify(buildGraph([buildFAQPage({ faqs: [entity], pageUrl, siteUrl })]));
  }
  return undefined;
}

function sitemapProjection(entities: readonly ContentEntity[], siteUrl: string): string {
  return buildSitemapXml(
    entities.map((entity) => ({
      ...buildSitemapUrl(siteUrl, entity.canonical.path),
      lastmod: "modifiedAt" in entity ? entity.modifiedAt : entity.provenance.updatedAt,
    }))
  );
}

function feedProjection(entities: readonly TitledContent[], siteUrl: string, now: string): string {
  return buildFeedXml({
    siteUrl,
    title: "SeoVista Insights",
    description:
      "Research and guides on generative engine optimization, search visibility, and digital authority.",
    feedUrl: `${siteUrl}/feed.xml`,
    entries: entities.map((entity) => ({
      id: entity.canonical.absolute,
      title: entity.title,
      description: entity.description,
      link: entity.canonical.absolute,
      publishedAt: entity.publishedAt ?? entity.provenance.createdAt,
      modifiedAt: entity.modifiedAt,
    })),
    updatedAt: now,
    language: "en",
  });
}

function llmsProjection(entities: readonly TitledContent[], siteUrl: string): string {
  return buildLlmsTxt({
    siteUrl,
    description:
      "SeoVista is a foundation-stage editorial intelligence lab for generative engine optimization and search visibility. This site is informational and does not claim ranking-factor benefits or promised inclusion in AI models.",
    resources: entities.map((entity) => ({ title: entity.title, url: entity.canonical.absolute })),
  });
}

/**
 * Derives all public representations from the content adapter. Every call reads
 * the adapter afresh, so eligibility and relationship changes cannot be served
 * from a stale projection cache.
 */
export function buildPublicProjectionMatrix(
  options: PublicProjectionMatrixOptions
): PublicProjectionMatrix {
  const html = eligibleContent(options, "html");
  const metadata = eligibleContent(options, "metadata").filter(isTitledContent);
  const jsonLd = eligibleContent(options, "jsonLd");
  const sitemap = eligibleContent(options, "sitemap");
  const feed = eligibleContent(options, "feed").filter(isTitledContent);
  const llms = eligibleContent(options, "llms").filter(isTitledContent);

  return {
    html: html.map(renderHtml),
    metadata: metadata.map((entity) => metadataProjection(entity, options.siteUrl)),
    jsonLd: jsonLd
      .map((entity) => jsonLdProjection(entity, options.siteUrl))
      .filter((value): value is string => value !== undefined),
    sitemap: sitemapProjection(sitemap, options.siteUrl),
    feed: feedProjection(feed, options.siteUrl, options.now),
    llms: llmsProjection(llms, options.siteUrl),
  };
}

export function buildPublicJsonLdNodes(
  options: PublicProjectionMatrixOptions
): readonly SchemaNode[] {
  return eligibleContent(options, "jsonLd").flatMap((entity) => {
    if (isPage(entity)) return [buildWebPage({ page: entity, siteUrl: options.siteUrl })];
    if (isFaq(entity)) {
      return [
        buildFAQPage({
          faqs: [entity],
          pageUrl: resolveCanonical(options.siteUrl, entity.canonical.path),
          siteUrl: options.siteUrl,
        }),
      ];
    }
    return [];
  });
}
