/**
 * Environment variable manifest.
 *
 * Every consumed variable is declared with its owner process, classification,
 * requirement level, and a short validation rule. This manifest is the source
 * of truth for the Zod schemas and for the `.env.example` coverage check.
 */

export type EnvOwner = "web" | "worker" | "shared";
export type EnvClassification = "public" | "server" | "secret";
export type EnvRequirement = "required" | "optional";

export interface EnvVariable {
  name: string;
  owner: EnvOwner;
  classification: EnvClassification;
  requirement: EnvRequirement;
  rule: string;
}

export const ENV_VARIABLES = [
  {
    name: "NEXT_PUBLIC_SITE_URL",
    owner: "web",
    classification: "public",
    requirement: "required",
    rule: "Valid HTTPS URL used for canonical generation",
  },
  {
    name: "NEXT_PUBLIC_ANALYTICS_ID",
    owner: "web",
    classification: "public",
    requirement: "optional",
    rule: "Non-sensitive analytics identifier exposed to browser",
  },
  {
    name: "DATABASE_URL",
    owner: "worker",
    classification: "secret",
    requirement: "required",
    rule: "PostgreSQL connection string; never logged",
  },
  {
    name: "REDIS_URL",
    owner: "worker",
    classification: "secret",
    requirement: "required",
    rule: "Redis connection string; never logged",
  },
  {
    name: "NEXTG_API_URL",
    owner: "web",
    classification: "server",
    requirement: "required",
    rule: "URL of the NextG mock / adapter endpoint",
  },
  {
    name: "NEXTG_API_TOKEN",
    owner: "web",
    classification: "secret",
    requirement: "optional",
    rule: "Bearer token for NextG when live integration is enabled",
  },
  {
    name: "DATAFORSEO_API_KEY",
    owner: "worker",
    classification: "secret",
    requirement: "optional",
    rule: "DataForSEO credential; required only in live mode",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    owner: "web",
    classification: "server",
    requirement: "optional",
    rule: "Google OAuth client ID; required only when OAuth is enabled",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    owner: "web",
    classification: "secret",
    requirement: "optional",
    rule: "Google OAuth client secret; required only when OAuth is enabled",
  },
  {
    name: "GOOGLE_REDIRECT_URI",
    owner: "web",
    classification: "server",
    requirement: "optional",
    rule: "Google OAuth redirect URI; required only when OAuth is enabled",
  },
  {
    name: "OBJECT_STORAGE_ENDPOINT",
    owner: "worker",
    classification: "server",
    requirement: "optional",
    rule: "S3-compatible storage endpoint URL",
  },
  {
    name: "OBJECT_STORAGE_BUCKET",
    owner: "worker",
    classification: "server",
    requirement: "optional",
    rule: "Storage bucket name",
  },
  {
    name: "OBJECT_STORAGE_ACCESS_KEY",
    owner: "worker",
    classification: "secret",
    requirement: "optional",
    rule: "Storage access key",
  },
  {
    name: "OBJECT_STORAGE_SECRET_KEY",
    owner: "worker",
    classification: "secret",
    requirement: "optional",
    rule: "Storage secret key",
  },
  {
    name: "EMAIL_PROVIDER_API_KEY",
    owner: "worker",
    classification: "secret",
    requirement: "optional",
    rule: "Email provider credential; required only in live mode",
  },
  {
    name: "EMAIL_FROM",
    owner: "worker",
    classification: "server",
    requirement: "optional",
    rule: "Sender email address; required only when email is enabled",
  },
  {
    name: "SENTRY_DSN",
    owner: "web",
    classification: "server",
    requirement: "optional",
    rule: "Sentry DSN URL",
  },
  {
    name: "REPORT_SIGNING_SECRET",
    owner: "worker",
    classification: "secret",
    requirement: "optional",
    rule: "HMAC secret for signed report links",
  },
  {
    name: "AUDIT_DAILY_COST_LIMIT",
    owner: "worker",
    classification: "server",
    requirement: "optional",
    rule: "Non-negative finite decimal number",
  },
  {
    name: "AUDIT_PER_IP_RATE_LIMIT",
    owner: "worker",
    classification: "server",
    requirement: "optional",
    rule: "Positive finite decimal number",
  },
] as const satisfies readonly EnvVariable[];

export type EnvName = (typeof ENV_VARIABLES)[number]["name"];
