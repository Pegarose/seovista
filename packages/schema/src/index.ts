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
} from "./types.js";

export {
  SchemaValidationError,
  PROHIBITED_CLAIMS,
  rejectProhibitedClaims,
  validateSiteUrl,
  validatePath,
  buildAbsoluteUrl,
  ensureString,
} from "./validate.js";

export { organizationId, websiteId, aboutBrandId } from "./ids.js";

export { buildOrganization } from "./builders/organization.js";
export { buildWebSite, buildWebSiteFromOrganization } from "./builders/website.js";
export { buildWebPage } from "./builders/webpage.js";
export { buildService } from "./builders/service.js";
export { buildPerson } from "./builders/person.js";
export { buildArticle, buildBlogPosting } from "./builders/article.js";
export { buildBreadcrumbList } from "./builders/breadcrumb.js";
export { buildWebApplication, buildSoftwareApplication } from "./builders/web-application.js";
export { buildFAQPage } from "./builders/faq-page.js";
export { buildDefinedTerm } from "./builders/defined-term.js";
export { buildAboutBrand } from "./builders/about-brand.js";
export { buildGraph, renderGraph } from "./graph.js";
