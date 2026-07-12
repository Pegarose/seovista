export const name: string = "@seovista/audit-core";

export {
  validateUrl,
  isSafeUrl,
  normalizeUrl,
  DEFAULT_ALLOWED_SCHEMES,
  DEFAULT_DENIED_PORTS,
  type SsrfPolicy,
  type UrlValidationResult,
} from "./security/url.js";

export {
  validateIpAddress,
  isSafeIpAddress,
  validateHostname,
  isSafeHostname,
  validateResolverResult,
  type AddressValidationResult,
  DENIED_IPV4_CIDRS,
  DENIED_IPV6_CIDRS,
  DENIED_HOSTS,
} from "./security/address.js";

export {
  validateRedirectChain,
  isSafeRedirectChain,
  DEFAULT_MAX_REDIRECTS,
  type RedirectHop,
  type RedirectValidationResult,
} from "./security/redirect.js";

export {
  crawlPolicySchema,
  parseCrawlPolicy,
  safeParseCrawlPolicy,
  type CrawlPolicy,
} from "./policy/crawl.js";

export {
  redactValue,
  redactObject,
  redactForLogging,
  rejectCanary,
  CanaryValueError,
  DEFAULT_ALLOWLIST,
  type RedactionOptions,
} from "./observability/redact.js";
