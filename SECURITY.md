# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in SeoVista, please report it privately to the engineering team. Do not open a public issue, post exploit details, or share sensitive reproduction steps in public channels.

- Email reports to the project security contact (see repository owner or team settings).
- Include a clear description of the issue, the affected component, and a minimal reproduction path if possible.
- Allow reasonable time for triage and remediation before public disclosure.
- We will acknowledge receipt, confirm the vulnerability scope, and provide a timeline for resolution.

## Secret Handling

- Production secrets, API keys, encryption keys, and credentials must never be committed to source control, tracked in plain-text files, or exposed in build artifacts.
- Server-only environment variables must be injected through the runtime environment and kept out of browser bundles, HTML responses, JSON-LD, manifests, sitemaps, feeds, analytics payloads, and log output.
- Local development placeholders must use the variable names listed in `.env.example` and must never contain real credentials.
- If a secret is accidentally committed, rotate it immediately and notify the security contact.
- Use field-specific, redacted diagnostics when environment validation fails; never echo secret values in error messages.

## Supported Versions

Sprint 0 is the current supported foundation. Security updates will be applied to the latest development branch and backported to active release branches when applicable.
