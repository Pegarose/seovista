import "server-only";

import type { Metadata } from "next";
import { buildMetadata } from "@seovista/seo-core";
import type { MetadataInput } from "@seovista/seo-core";
import { siteUrl } from "../content/site";

export function pageMetadata(input: MetadataInput): Metadata {
  return toNextMetadata(buildMetadata(siteUrl, input));
}

export function pageMetadataFrom(input: { title: string; description: string; canonicalPath: string }): Metadata {
  return toNextMetadata(
    buildMetadata(siteUrl, {
      title: input.title,
      description: input.description,
      canonicalPath: input.canonicalPath,
    }),
  );
}

function toNextMetadata(result: ReturnType<typeof buildMetadata>): Metadata {
  return {
    title: result.title,
    description: result.description,
    alternates: {
      canonical: result.canonical,
    },
    robots: {
      index: result.robots.index,
      follow: result.robots.follow,
    },
    openGraph: {
      title: result.openGraph.title,
      description: result.openGraph.description,
      url: result.openGraph.url,
      type: result.openGraph.type as
        | "website"
        | "article"
        | "book"
        | "profile"
        | "music.song"
        | "music.album"
        | "music.playlist"
        | "music.radio_station"
        | "video.movie"
        | "video.episode"
        | "video.tv_show"
        | "video.other",
      locale: result.openGraph.locale,
      siteName: result.openGraph.siteName,
      images: result.openGraph.images ? [...result.openGraph.images] : undefined,
    },
    twitter: {
      card: result.twitter.card,
      title: result.twitter.title,
      description: result.twitter.description,
      images: result.twitter.images ? [...result.twitter.images] : undefined,
    },
    manifest: "/manifest.webmanifest",
  };
}
