import "server-only";

import type { Page, Service } from "@seovista/content-models";
import {
  buildGraph,
  buildOrganization,
  buildWebSiteFromOrganization,
  buildWebPage,
  buildService,
  buildBreadcrumbList,
  buildAboutBrand,
  organizationId,
  type SchemaNode,
} from "@seovista/schema";
import { organization, siteUrl } from "../content/site";

export function buildPageGraph(page: Page, extraNodes: readonly SchemaNode[] = []): ReturnType<typeof buildGraph> {
  const org = buildOrganization(siteUrl, organization);
  const website = buildWebSiteFromOrganization(siteUrl, organization.name);
  const webpage = buildWebPage({ page, siteUrl });

  return buildGraph([org, website, webpage, ...extraNodes]);
}

export function buildServicePageGraph(page: Page, service: Service): ReturnType<typeof buildGraph> {
  const orgId = organizationId(siteUrl);
  const serviceNode = buildService({ service, siteUrl, organizationId: orgId });
  const breadcrumb = buildBreadcrumbList({
    siteUrl,
    items: [
      { name: "Home", path: "/" },
      { name: service.name, path: service.canonical.path },
    ],
  });
  return buildPageGraph(page, [serviceNode, breadcrumb]);
}

export function buildAboutPageGraph(page: Page): ReturnType<typeof buildGraph> {
  const orgId = organizationId(siteUrl);
  const brand = buildAboutBrand({ organization, siteUrl, organizationId: orgId });
  return buildPageGraph(page, [brand]);
}
