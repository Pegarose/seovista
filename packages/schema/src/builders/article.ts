import { ensureString, rejectProhibitedClaims, buildAbsoluteUrl } from "../validate.js";
import type { SchemaNode, ArticleInput } from "../types.js";

export function buildArticle(
  input: ArticleInput,
  type: "Article" | "BlogPosting" = "BlogPosting",
): SchemaNode {
  rejectProhibitedClaims(input.article as unknown as Record<string, unknown>);

  const article = input.article;
  const title = ensureString(article.title, "article.title");
  const description = ensureString(article.description, "article.description");
  const url = buildAbsoluteUrl(input.siteUrl, article.canonical.path);

  if (!input.authorPerson && !article.author) {
    throw new Error("Article requires visible authorship evidence.");
  }

  const node: SchemaNode = {
    "@type": type,
    "@id": url,
    url,
    headline: title,
    name: title,
    description,
    inLanguage: article.locale || "en",
  };

  if (input.authorPerson) {
    node.author = input.authorPerson;
  }

  if (article.publishedAt) {
    node.datePublished = article.publishedAt;
  }
  if (article.modifiedAt) {
    node.dateModified = article.modifiedAt;
  }

  return node;
}

export function buildBlogPosting(input: ArticleInput): SchemaNode {
  return buildArticle(input, "BlogPosting");
}
