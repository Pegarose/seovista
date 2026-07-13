import { resolveCanonical, resolveCanonicalFromOverride, parseSiteUrl } from "./canonical";
import type { MetadataInput, MetadataResult, OpenGraphType, RobotsValue, TwitterCard } from "./types";

export function buildMetadata(siteUrl: string, input: MetadataInput): MetadataResult {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("Metadata title must be a non-empty string.");
  }
  if (!input.description || input.description.trim().length === 0) {
    throw new Error("Metadata description must be a non-empty string.");
  }

  const canonical = input.canonicalOverride
    ? resolveCanonicalFromOverride(siteUrl, input.canonicalOverride)
    : resolveCanonical(siteUrl, input.canonicalPath);

  const locale = input.locale || "en";
  const ogType: OpenGraphType = input.ogType || "website";
  const twitterCard: TwitterCard = input.twitterCard || "summary_large_image";

  const robots: RobotsValue = {
    index: input.isQueryState ? false : (input.indexable ?? true),
    follow: input.isQueryState ? false : (input.followLinks ?? true),
  };

  const socialImageUrl = input.socialImage ? resolveSocialImageUrl(siteUrl, input.socialImage) : undefined;

  const openGraphImages = socialImageUrl ? [{ url: socialImageUrl }] : undefined;
  const twitterImages = socialImageUrl ? [socialImageUrl] : undefined;

  const result: MetadataResult = {
    title: input.title,
    description: input.description,
    canonical,
    locale,
    robots,
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      type: ogType,
      locale,
      ...(openGraphImages ? { images: openGraphImages } : {}),
    },
    twitter: {
      card: twitterCard,
      title: input.title,
      description: input.description,
      ...(twitterImages ? { images: twitterImages } : {}),
    },
    alternates: {
      canonical,
    },
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    ...(input.modifiedAt ? { modifiedAt: input.modifiedAt } : {}),
  };

  return result;
}

export function buildNoIndexMetadata(siteUrl: string, input: Omit<MetadataInput, "indexable" | "isQueryState">): MetadataResult {
  return buildMetadata(siteUrl, { ...input, indexable: false });
}

function resolveSocialImageUrl(siteUrl: string, imageUrl: string): string {
  const { origin } = parseSiteUrl(siteUrl);
  if (imageUrl.startsWith("/")) {
    return `${origin}${imageUrl}`;
  }
  return imageUrl;
}
