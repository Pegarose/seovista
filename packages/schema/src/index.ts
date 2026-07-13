export const name: string = "@seovista/schema";

export type {
  SchemaOrgType,
  SchemaNode,
  SchemaGraph,
  WebPageInput,
  ServiceInput,
  PersonInput,
  ArticleInput,
  FAQPageInput,
  DefinedTermInput,
  WebApplicationInput,
  BreadcrumbItem,
  BreadcrumbListInput,
  AboutBrandInput,
  ProhibitedClaimCheck,
} from "./types";

export {
  SchemaValidationError,
  PROHIBITED_CLAIMS,
  rejectProhibitedClaims,
  validateSiteUrl,
  validatePath,
  buildAbsoluteUrl,
  ensureString,
} from "./validate";

export { organizationId, websiteId, aboutBrandId } from "./ids";

export { buildOrganization } from "./builders/organization";
export { buildWebSite, buildWebSiteFromOrganization } from "./builders/website";
export { buildWebPage } from "./builders/webpage";
export { buildService } from "./builders/service";
export { buildPerson } from "./builders/person";
export { buildArticle, buildBlogPosting } from "./builders/article";
export { buildBreadcrumbList } from "./builders/breadcrumb";
export { buildWebApplication, buildSoftwareApplication } from "./builders/web-application";
export { buildFAQPage } from "./builders/faq-page";
export { buildDefinedTerm } from "./builders/defined-term";
export { buildAboutBrand } from "./builders/about-brand";
export { buildGraph, renderGraph } from "./graph";
