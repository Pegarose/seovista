import type { Article, Author, Definition, FAQ, Organization, Page, Service, Tool } from "@seovista/content-models";

export type SchemaOrgType =
  | "Organization"
  | "WebSite"
  | "WebPage"
  | "Service"
  | "Person"
  | "Article"
  | "BlogPosting"
  | "BreadcrumbList"
  | "WebApplication"
  | "SoftwareApplication"
  | "FAQPage"
  | "Question"
  | "Answer"
  | "DefinedTerm"
  | "Brand";

export type SchemaNode = Record<string, unknown>;

export interface SchemaGraph {
  readonly "@context": "https://schema.org";
  readonly "@graph": readonly SchemaNode[];
}

export interface WebPageInput {
  readonly page: Page;
  readonly siteUrl: string;
}

export interface ServiceInput {
  readonly service: Service;
  readonly siteUrl: string;
  readonly organizationId: string;
}

export interface PersonInput {
  readonly author: Author;
  readonly siteUrl: string;
}

export interface ArticleInput {
  readonly article: Article;
  readonly siteUrl: string;
  readonly authorPerson?: SchemaNode | undefined;
}

export interface FAQPageInput {
  readonly faqs: readonly FAQ[];
  readonly pageUrl: string;
  readonly siteUrl: string;
}

export interface DefinedTermInput {
  readonly definition: Definition;
  readonly siteUrl: string;
}

export interface WebApplicationInput {
  readonly tool: Tool;
  readonly siteUrl: string;
  readonly organizationId: string;
}

export interface BreadcrumbItem {
  readonly name: string;
  readonly path: string;
}

export interface BreadcrumbListInput {
  readonly items: readonly BreadcrumbItem[];
  readonly siteUrl: string;
}

export interface AboutBrandInput {
  readonly organization: Organization;
  readonly siteUrl: string;
  readonly organizationId: string;
}

export interface ProhibitedClaimCheck {
  readonly field: string;
  readonly reason: string;
}

export type SchemaBuilderInput =
  | Organization
  | Page
  | Service
  | Tool
  | Article
  | Author
  | Definition
  | FAQ;
